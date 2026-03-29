#!/usr/bin/env bash
set -euo pipefail

# Setup script for running the visuals pipeline on a fresh macOS machine.
# Usage: bash setup-remote.sh
#
# Prerequisites: Homebrew must be installed.
# After running, you still need to copy songs/ and images/ to the repo.

echo "=== Visuals Pipeline Setup ==="

# Check for Homebrew
if ! command -v brew &>/dev/null; then
  echo "Error: Homebrew is not installed."
  echo "Install it: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  exit 1
fi

# Install Node.js
if command -v node &>/dev/null; then
  echo "Node.js already installed: $(node --version)"
else
  echo "Installing Node.js..."
  brew install node
fi

# Install ffmpeg
if command -v ffmpeg &>/dev/null; then
  echo "ffmpeg already installed: $(ffmpeg -version 2>&1 | head -1)"
else
  echo "Installing ffmpeg..."
  brew install ffmpeg
fi

# Install Processing
if [ -d "/Applications/Processing.app" ]; then
  echo "Processing.app already installed"
else
  echo "Installing Processing..."
  brew install --cask processing
fi

# Install processing-java CLI
if command -v processing-java &>/dev/null; then
  echo "processing-java already installed: $(processing-java --help 2>&1 | head -1)"
else
  echo "Installing processing-java CLI..."
  PJAVA="/Applications/Processing.app/Contents/MacOS/processing-java"
  if [ -f "$PJAVA" ]; then
    sudo ln -sf "$PJAVA" /usr/local/bin/processing-java
    echo "Linked processing-java to /usr/local/bin/"
  else
    echo "Warning: processing-java not found in Processing.app"
    echo "Open Processing.app > Tools > Install \"processing-java\""
  fi
fi

# Clone repo if not already in it
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/../package.json" ]; then
  REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
  echo "Already in repo: $REPO_DIR"
else
  if [ -d "$HOME/visuals" ]; then
    REPO_DIR="$HOME/visuals"
    echo "Repo already cloned: $REPO_DIR"
  else
    echo "Cloning repo..."
    git clone https://github.com/brklyn8900/visuals.git "$HOME/visuals"
    REPO_DIR="$HOME/visuals"
  fi
fi

# Install npm dependencies
cd "$REPO_DIR"
echo "Installing npm dependencies..."
npm install

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Copy media files from your main machine:"
echo "     scp -r songs/ ron@this-machine:$REPO_DIR/songs/"
echo "     scp -r images/ ron@this-machine:$REPO_DIR/images/"
echo ""
echo "  2. Render:"
echo "     cd $REPO_DIR"
echo "     ./processing/render ./songs/fin.mp3 landscape /tmp/test-elegy.mp4 --sketch elegy --image ./images/fin/"
