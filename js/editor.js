// editor.js — Code editor with syntax highlighting, line numbers, breakpoints
import { tokenizeLine } from './assembler.js';

export class Editor {
  constructor(container) {
    this.container = container;
    this.lines = [''];
    this.breakpoints = new Set();
    this.currentLine = -1; // Currently executing line (1-indexed)
    this.onBreakpointChange = null;
    this.onCodeChange = null;
    this.build();
  }

  build() {
    this.container.innerHTML = '';
    this.container.className = 'editor-container';

    // Gutter (line numbers + breakpoints)
    this.gutter = document.createElement('div');
    this.gutter.className = 'editor-gutter';
    this.gutter.id = 'editor-gutter';

    // Highlight overlay
    this.highlight = document.createElement('pre');
    this.highlight.className = 'editor-highlight';
    this.highlight.id = 'editor-highlight';

    // Textarea
    this.textarea = document.createElement('textarea');
    this.textarea.className = 'editor-textarea';
    this.textarea.id = 'editor-textarea';
    this.textarea.spellcheck = false;
    this.textarea.autocomplete = 'off';
    this.textarea.autocapitalize = 'off';
    this.textarea.placeholder = '; Write your assembly code here...\n; Use Intel syntax (MOV EAX, 5)\n; Click line numbers to set breakpoints';

    // Textarea wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'editor-wrapper';
    wrapper.appendChild(this.highlight);
    wrapper.appendChild(this.textarea);

    this.container.appendChild(this.gutter);
    this.container.appendChild(wrapper);

    // Event listeners
    this.textarea.addEventListener('input', () => this._onInput());
    this.textarea.addEventListener('scroll', () => this._syncScroll());
    this.textarea.addEventListener('keydown', (e) => this._onKeyDown(e));
    this.gutter.addEventListener('click', (e) => this._onGutterClick(e));

    this._onInput();
  }

  getValue() {
    return this.textarea.value;
  }

  setValue(code) {
    this.textarea.value = code;
    this._onInput();
  }

  setCurrentLine(lineNumber) {
    this.currentLine = lineNumber;
    this._updateGutter();
    this._updateHighlight();
    // Scroll to current line
    if (lineNumber > 0) {
      const lineHeight = 22;
      const targetScroll = (lineNumber - 1) * lineHeight - this.textarea.clientHeight / 3;
      if (targetScroll > this.textarea.scrollTop + this.textarea.clientHeight - lineHeight * 2 ||
          targetScroll < this.textarea.scrollTop - lineHeight * 2) {
        this.textarea.scrollTop = Math.max(0, targetScroll);
      }
    }
  }

  clearCurrentLine() {
    this.currentLine = -1;
    this._updateGutter();
    this._updateHighlight();
  }

  getBreakpoints() {
    return new Set(this.breakpoints);
  }

  _onInput() {
    this.lines = this.textarea.value.split('\n');
    this._updateGutter();
    this._updateHighlight();
    if (this.onCodeChange) this.onCodeChange(this.textarea.value);
  }

  _syncScroll() {
    this.gutter.scrollTop = this.textarea.scrollTop;
    this.highlight.scrollTop = this.textarea.scrollTop;
    this.highlight.scrollLeft = this.textarea.scrollLeft;
  }

  _onKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = this.textarea.selectionStart;
      const end = this.textarea.selectionEnd;
      this.textarea.value = this.textarea.value.substring(0, start) + '  ' + this.textarea.value.substring(end);
      this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;
      this._onInput();
    }
  }

  _onGutterClick(e) {
    const lineEl = e.target.closest('.gutter-line');
    if (!lineEl) return;
    const lineNum = parseInt(lineEl.dataset.line);
    if (isNaN(lineNum)) return;

    if (this.breakpoints.has(lineNum)) {
      this.breakpoints.delete(lineNum);
    } else {
      this.breakpoints.add(lineNum);
    }
    this._updateGutter();
    if (this.onBreakpointChange) this.onBreakpointChange(this.breakpoints);
  }

  _updateGutter() {
    let html = '';
    for (let i = 0; i < this.lines.length; i++) {
      const lineNum = i + 1;
      const isBP = this.breakpoints.has(lineNum);
      const isCurrent = lineNum === this.currentLine;
      let cls = 'gutter-line';
      if (isBP) cls += ' has-breakpoint';
      if (isCurrent) cls += ' current-line';
      html += `<div class="${cls}" data-line="${lineNum}">`;
      html += `<span class="bp-marker">${isBP ? '●' : ''}</span>`;
      html += `<span class="line-num">${lineNum}</span>`;
      html += '</div>';
    }
    this.gutter.innerHTML = html;
  }

  _updateHighlight() {
    let html = '';
    for (let i = 0; i < this.lines.length; i++) {
      const lineNum = i + 1;
      const isCurrent = lineNum === this.currentLine;
      const lineClass = isCurrent ? 'hl-line current-exec-line' : 'hl-line';
      const tokens = tokenizeLine(this.lines[i]);
      let lineHtml = '';
      for (const token of tokens) {
        const escaped = this._escapeHtml(token.text);
        lineHtml += `<span class="tok-${token.type}">${escaped}</span>`;
      }
      if (!lineHtml) lineHtml = ' '; // Preserve empty line height
      html += `<div class="${lineClass}">${lineHtml}</div>`;
    }
    this.highlight.innerHTML = html;
  }

  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
