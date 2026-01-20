#!/bin/bash
# Download official model icons from LobeHub CDN
# Source: https://lobehub.com/icons

ICONS_DIR="public/icons/models"
mkdir -p "$ICONS_DIR"

CDN_BASE="https://registry.npmmirror.com/@lobehub/icons-static-svg/latest/files/icons"

echo "Downloading model icons..."

# Claude (Anthropic)
curl -sL "$CDN_BASE/claude.svg" -o "$ICONS_DIR/claude.svg"
curl -sL "$CDN_BASE/claude-color.svg" -o "$ICONS_DIR/claude-color.svg" 2>/dev/null || true

# OpenAI / ChatGPT
curl -sL "$CDN_BASE/openai.svg" -o "$ICONS_DIR/openai.svg"
curl -sL "$CDN_BASE/chatgpt.svg" -o "$ICONS_DIR/chatgpt.svg" 2>/dev/null || true

# Google Gemini
curl -sL "$CDN_BASE/gemini.svg" -o "$ICONS_DIR/gemini.svg" 2>/dev/null || true
curl -sL "$CDN_BASE/google.svg" -o "$ICONS_DIR/google.svg"

# DeepSeek
curl -sL "$CDN_BASE/deepseek.svg" -o "$ICONS_DIR/deepseek.svg" 2>/dev/null || true
curl -sL "$CDN_BASE/deepseek-color.svg" -o "$ICONS_DIR/deepseek-color.svg" 2>/dev/null || true

# Qwen (Alibaba)
curl -sL "$CDN_BASE/qwen.svg" -o "$ICONS_DIR/qwen.svg" 2>/dev/null || true
curl -sL "$CDN_BASE/qwen-color.svg" -o "$ICONS_DIR/qwen-color.svg" 2>/dev/null || true

# Grok (xAI)
curl -sL "$CDN_BASE/grok.svg" -o "$ICONS_DIR/grok.svg" 2>/dev/null || true
curl -sL "$CDN_BASE/xai.svg" -o "$ICONS_DIR/xai.svg" 2>/dev/null || true

# Mistral
curl -sL "$CDN_BASE/mistral.svg" -o "$ICONS_DIR/mistral.svg" 2>/dev/null || true
curl -sL "$CDN_BASE/mistral-color.svg" -o "$ICONS_DIR/mistral-color.svg" 2>/dev/null || true

echo "Done! Icons saved to $ICONS_DIR"
ls -la "$ICONS_DIR"
