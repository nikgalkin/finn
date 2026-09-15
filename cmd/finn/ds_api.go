package main

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// setupDatasourceAPI exposes the Inbox and the run button. Registering a plugin
// is deliberately absent: the registry lives in config.yml, and an endpoint that
// could add one would hand arbitrary code execution to anything that reaches
// loopback.
func setupDatasourceAPI(api *gin.RouterGroup, cfg *Config, db *sql.DB, isDemo bool) *dsService {
	service := newDatasourceService(cfg, db, isDemo)

	group := api.Group("/ds")
	group.Use(requireLocalRequest("datasources are only available locally"))

	group.GET("/summary", service.handleSummary)
	group.GET("/sources", service.handleSources)
	group.POST("/sources/:name/confirm", service.handleConfirm)
	group.POST("/sources/:name/fetch", service.handleFetch)
	group.GET("/runs", service.handleRuns)
	group.GET("/inbox", service.handleInbox)
	group.PUT("/inbox/:id", service.handleInboxUpdate)
	group.POST("/inbox/accept", service.handleAccept)
	group.POST("/inbox/reject", service.handleReject)
	group.POST("/inbox/reopen", service.handleReopen)
	group.DELETE("/inbox", service.handleClear)

	return service
}

func (service *dsService) handleSummary(c *gin.Context) {
	view, err := service.summary()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, view)
}

// datasourceErrorStatus maps the refusals to codes the UI can act on: 409 for
// "confirm first" is what opens the confirmation dialog rather than an error
// banner.
func datasourceErrorStatus(err error) int {
	switch {
	case errors.Is(err, errDatasourceUnknown):
		return http.StatusNotFound
	case errors.Is(err, errDatasourcesDisabled), errors.Is(err, errDatasourcesDemo), errors.Is(err, errDatasourceOff):
		return http.StatusForbidden
	case errors.Is(err, errDatasourceNeedsOK), errors.Is(err, errDatasourceBusy):
		return http.StatusConflict
	default:
		return http.StatusBadRequest
	}
}

func datasourceErrorCode(err error) string {
	switch {
	case errors.Is(err, errDatasourceNeedsOK):
		return "confirmation_required"
	case errors.Is(err, errDatasourceBusy):
		return "busy"
	case errors.Is(err, errDatasourcesDemo):
		return "demo"
	case errors.Is(err, errDatasourcesDisabled):
		return "disabled"
	default:
		return ""
	}
}

func abortWithDatasourceError(c *gin.Context, err error) {
	payload := gin.H{"error": err.Error()}
	if code := datasourceErrorCode(err); code != "" {
		payload["code"] = code
	}
	c.JSON(datasourceErrorStatus(err), payload)
}

// handleSources answers even when datasources are off, so the SPA can decide
// whether to show the page at all without a second endpoint.
func (service *dsService) handleSources(c *gin.Context) {
	view, err := service.sources()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, view)
}

func (service *dsService) handleConfirm(c *gin.Context) {
	source, err := service.confirm(c.Param("name"))
	if err != nil {
		abortWithDatasourceError(c, err)
		return
	}
	c.JSON(http.StatusOK, source)
}

func (service *dsService) handleFetch(c *gin.Context) {
	options := dsFetchOptions{DryRun: c.Query("dry_run") == "true"}
	summary, err := service.fetch(c.Request.Context(), c.Param("name"), options)
	if err != nil {
		abortWithDatasourceError(c, err)
		return
	}
	// A plugin that failed is still a completed request: the summary carries the
	// exit code and the stderr tail, which is exactly what the user needs to see.
	c.JSON(http.StatusOK, summary)
}

func (service *dsService) handleRuns(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	runs, err := service.runs(strings.TrimSpace(c.Query("source")), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, runs)
}

func (service *dsService) handleInbox(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	items, err := service.inbox(dsInboxFilter{
		Status: c.Query("status"),
		Source: c.Query("source"),
		Limit:  limit,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, items)
}

func (service *dsService) handleInboxUpdate(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid Inbox item id"})
		return
	}
	var request FlowEntryRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid movement"})
		return
	}

	item, err := service.updateDraft(id, request)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		c.JSON(http.StatusNotFound, gin.H{"error": "no such Inbox item"})
		return
	case err != nil:
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, item)
}

type dsIDsRequest struct {
	IDs             []int64 `json:"ids"`
	AllowDuplicates bool    `json:"allowDuplicates"`
}

func bindIDs(c *gin.Context) (dsIDsRequest, bool) {
	var request dsIDsRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids are required"})
		return request, false
	}
	if len(request.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids are required"})
		return request, false
	}
	if len(request.IDs) > 1000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no more than 1000 items at a time"})
		return request, false
	}
	seen := make(map[int64]struct{}, len(request.IDs))
	for _, id := range request.IDs {
		if id <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ids must be positive"})
			return request, false
		}
		if _, duplicate := seen[id]; duplicate {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ids must be unique"})
			return request, false
		}
		seen[id] = struct{}{}
	}
	return request, true
}

func (service *dsService) handleAccept(c *gin.Context) {
	request, ok := bindIDs(c)
	if !ok {
		return
	}
	result, err := service.accept(request.IDs, request.AllowDuplicates)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (service *dsService) handleReject(c *gin.Context) {
	request, ok := bindIDs(c)
	if !ok {
		return
	}
	rejected, err := service.reject(request.IDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"rejected": rejected})
}

func (service *dsService) handleReopen(c *gin.Context) {
	request, ok := bindIDs(c)
	if !ok {
		return
	}
	reopened, err := service.reopen(request.IDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"reopened": reopened})
}

// handleClear is the only way rows leave the Inbox. Whatever it removes may be
// proposed again by the next fetch, because deduplication lives in the rows it
// just deleted; the UI says so before asking.
func (service *dsService) handleClear(c *gin.Context) {
	removed, err := service.clear(dsInboxFilter{Status: c.Query("status"), Source: c.Query("source")})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"removed": removed})
}
