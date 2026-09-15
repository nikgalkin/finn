package dsproto

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

// maxRequestBytes caps what Serve will read from stdin. A request carries a
// cursor and a few reference lists, never bulk data, so anything larger is a
// mistake rather than a workload.
const maxRequestBytes = 1 << 20

// Exit codes. Anything non-zero tells Finn the run failed and leaves the cursor
// where it was.
const (
	ExitOK       = 0
	ExitFailed   = 1
	ExitProtocol = 2
)

// Handler is the plugin itself. Manifest must be free of side effects and must
// not touch the network; Fetch is the one that talks to the outside world.
type Handler interface {
	Manifest(Request) (Manifest, error)
	Fetch(Request) (FetchResult, error)
}

// HandlerFuncs adapts two plain functions to Handler.
type HandlerFuncs struct {
	ManifestFunc func(Request) (Manifest, error)
	FetchFunc    func(Request) (FetchResult, error)
}

func (h HandlerFuncs) Manifest(request Request) (Manifest, error) {
	if h.ManifestFunc == nil {
		return Manifest{}, errors.New("manifest is not implemented")
	}
	return h.ManifestFunc(request)
}

func (h HandlerFuncs) Fetch(request Request) (FetchResult, error) {
	if h.FetchFunc == nil {
		return FetchResult{}, errors.New("fetch is not implemented")
	}
	return h.FetchFunc(request)
}

// Serve runs one command and exits. It is the whole main() of a plugin:
//
//	func main() { dsproto.Serve(myPlugin{}) }
func Serve(handler Handler) {
	os.Exit(Run(handler, os.Args[1:], os.Stdin, os.Stdout))
}

// Run is Serve without the exit, so a plugin's own tests can drive it.
func Run(handler Handler, args []string, stdin io.Reader, stdout io.Writer) int {
	response, code := run(handler, args, stdin)
	encoder := json.NewEncoder(stdout)
	if err := encoder.Encode(response); err != nil {
		fmt.Fprintf(os.Stderr, "dsproto: failed to write the response: %v\n", err)
		return ExitFailed
	}
	return code
}

func run(handler Handler, args []string, stdin io.Reader) (Response, int) {
	if len(args) == 0 {
		return NewErrorResponse(errors.New("a command is required: manifest or fetch")), ExitProtocol
	}
	command := strings.TrimSpace(args[0])

	request, err := readRequest(stdin)
	if err != nil {
		return NewErrorResponse(err), ExitProtocol
	}
	if request.Protocol != 0 && request.Protocol != Protocol {
		return NewErrorResponse(fmt.Errorf("unsupported protocol %d, this plugin speaks %d", request.Protocol, Protocol)), ExitProtocol
	}
	request.Protocol = Protocol
	// argv is the authority on what to do; the field is a cross-check, so a
	// request built for one command can never be answered as another.
	if request.Command != "" && request.Command != command {
		return NewErrorResponse(fmt.Errorf("command %q in the request does not match %q in argv", request.Command, command)), ExitProtocol
	}
	request.Command = command

	switch command {
	case CommandManifest:
		manifest, err := handler.Manifest(request)
		if err != nil {
			return NewErrorResponse(err), ExitFailed
		}
		return NewManifestResponse(manifest), ExitOK
	case CommandFetch:
		result, err := handler.Fetch(request)
		if err != nil {
			return NewErrorResponse(err), ExitFailed
		}
		if err := result.Validate(); err != nil {
			return NewErrorResponse(err), ExitFailed
		}
		return NewFetchResponse(result), ExitOK
	default:
		return NewErrorResponse(fmt.Errorf("unknown command %q", command)), ExitProtocol
	}
}

func readRequest(stdin io.Reader) (Request, error) {
	var request Request
	if stdin == nil {
		return request, nil
	}
	payload, err := io.ReadAll(io.LimitReader(stdin, maxRequestBytes+1))
	if err != nil {
		return request, fmt.Errorf("read request: %w", err)
	}
	if len(payload) > maxRequestBytes {
		return request, fmt.Errorf("request is larger than %d bytes", maxRequestBytes)
	}
	// An empty stdin is a person running the binary by hand to see what it is.
	// Finn always sends a request, so answering the bare command is a courtesy
	// that costs nothing.
	if len(strings.TrimSpace(string(payload))) == 0 {
		return request, nil
	}
	if err := json.Unmarshal(payload, &request); err != nil {
		return request, fmt.Errorf("decode request: %w", err)
	}
	return request, nil
}
