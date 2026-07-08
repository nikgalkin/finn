#!/bin/bash

# Stop the script if any command fails
set -e

# Output colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}🔑 Finn Backup Key Generator${NC}"
echo -e "----------------------------------------"

# Generate 32 cryptographically secure random bytes in base64 (256-bit entropy)
if command -v openssl >/dev/null 2>&1; then
    KEY=$(openssl rand -base64 32)
else
    # Fallback to urandom if openssl is missing
    KEY=$(LC_ALL=C tr -dc 'A-Za-z0-9+/=' < /dev/urandom | head -c 44)
fi

echo -e "${GREEN}✅ Your new secret cipher key has been successfully generated:${NC}"
echo -e "${CYAN}${KEY}${NC}"
echo -e "----------------------------------------"
echo -e "${YELLOW}💡 How to use it?${NC}"
echo -e "To let the Finn backend automatically catch this key, add it to your environment variables."
echo ""
echo -e "1. If you are using ${BLUE}macOS (Zsh)${NC}, run this command:"
echo -e "   ${CYAN}echo 'export FINN_BACKUP_CIPHER_KEY=\"${KEY}\"' >> ~/.zshrc && source ~/.zshrc${NC}"
echo ""
echo -e "2. If you are using ${BLUE}Linux (Bash)${NC}, run this command:"
echo -e "   ${CYAN}echo 'export FINN_BACKUP_CIPHER_KEY=\"${KEY}\"' >> ~/.bashrc && source ~/.bashrc${NC}"
echo ""
echo -e "3. You can verify that the key is set correctly by running:"
echo -e "   ${CYAN}echo \$FINN_BACKUP_CIPHER_KEY${NC}"
echo "----------------------------------------"
