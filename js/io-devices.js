// io-devices.js — Virtual IO devices for the CPU Visualizer
// LEDs, 7-segment display, text monitor, video monitor, input console

export class IODevices {
  constructor(container) {
    this.container = container;
    this.devices = {
      leds: { enabled: true, element: null, state: 0 },
      sevenSeg: { enabled: true, element: null, state: 0 },
      monitor: { enabled: true, element: null, buffer: [], cursorX: 0, cursorY: 0 },
      video: { enabled: true, element: null, pixels: null, width: 16, height: 16 },
      console: { enabled: true, element: null, inputBuffer: [], inputCallback: null },
    };
    this.td4Mode = false; // Simplified 4-LED mode for TD4
    this.build();
  }

  build() {
    this.container.innerHTML = '';

    // IO Devices Panel
    const header = document.createElement('div');
    header.className = 'io-header';
    header.innerHTML = '<h3>🔌 I/O Devices</h3>';
    this.container.appendChild(header);

    // Toggles
    const toggles = document.createElement('div');
    toggles.className = 'io-toggles';
    toggles.innerHTML = `
      <label class="io-toggle"><input type="checkbox" id="toggle-leds" checked> 💡 LEDs (8-bit)</label>
      <label class="io-toggle"><input type="checkbox" id="toggle-7seg" checked> 🔢 7-Segment</label>
      <label class="io-toggle"><input type="checkbox" id="toggle-monitor" checked> 🖥️ Text Monitor</label>
      <label class="io-toggle"><input type="checkbox" id="toggle-video" checked> 📺 Video Display</label>
      <label class="io-toggle"><input type="checkbox" id="toggle-console" checked> ⌨️ Input Console</label>
    `;
    this.container.appendChild(toggles);

    // LED Display
    this.devices.leds.element = document.createElement('div');
    this.devices.leds.element.className = 'io-device io-leds';
    this.devices.leds.element.id = 'io-leds';
    this.container.appendChild(this.devices.leds.element);
    this._buildLEDs();

    // 7-Segment Display
    this.devices.sevenSeg.element = document.createElement('div');
    this.devices.sevenSeg.element.className = 'io-device io-7seg';
    this.devices.sevenSeg.element.id = 'io-7seg';
    this.container.appendChild(this.devices.sevenSeg.element);
    this._build7Seg();

    // Text Monitor
    this.devices.monitor.element = document.createElement('div');
    this.devices.monitor.element.className = 'io-device io-monitor';
    this.devices.monitor.element.id = 'io-monitor';
    this.container.appendChild(this.devices.monitor.element);
    this._buildMonitor();

    // Video Display (16x16 pixel grid)
    this.devices.video.element = document.createElement('div');
    this.devices.video.element.className = 'io-device io-video';
    this.devices.video.element.id = 'io-video';
    this.container.appendChild(this.devices.video.element);
    this._buildVideo();

    // Input Console
    this.devices.console.element = document.createElement('div');
    this.devices.console.element.className = 'io-device io-console';
    this.devices.console.element.id = 'io-console';
    this.container.appendChild(this.devices.console.element);
    this._buildConsole();

    // Toggles event listeners
    this._setupToggles();
  }

  _setupToggles() {
    const toggleMap = {
      'toggle-leds': 'leds',
      'toggle-7seg': 'sevenSeg',
      'toggle-monitor': 'monitor',
      'toggle-video': 'video',
      'toggle-console': 'console',
    };
    for (const [id, key] of Object.entries(toggleMap)) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', (e) => {
          this.devices[key].enabled = e.target.checked;
          this.devices[key].element.style.display = e.target.checked ? 'block' : 'none';
        });
      }
    }
  }

  _buildLEDs() {
    const el = this.devices.leds.element;
    el.innerHTML = '<div class="io-device-title">💡 LEDs — INT 0x20 (AL = value)</div>';
    const row = document.createElement('div');
    row.className = 'led-row';
    for (let i = 7; i >= 0; i--) {
      const led = document.createElement('div');
      led.className = 'led off';
      led.id = `led-${i}`;
      led.title = `Bit ${i}`;
      const label = document.createElement('span');
      label.className = 'led-label';
      label.textContent = i;
      const wrap = document.createElement('div');
      wrap.className = 'led-wrap';
      wrap.appendChild(led);
      wrap.appendChild(label);
      row.appendChild(wrap);
    }
    el.appendChild(row);
    const valueLabel = document.createElement('div');
    valueLabel.className = 'led-value';
    valueLabel.id = 'led-value-display';
    valueLabel.textContent = '0x00 (0) = 00000000b';
    el.appendChild(valueLabel);
  }

  _build7Seg() {
    const el = this.devices.sevenSeg.element;
    el.innerHTML = '<div class="io-device-title">🔢 7-Segment — INT 0x22 (AL = digit 0-F)</div>';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 160');
    svg.setAttribute('class', 'seven-seg-svg');
    // Defs for glow
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `<filter id="seg-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>`;
    svg.appendChild(defs);
    const segments = {
      a: 'M 20,10 L 80,10 L 75,20 L 25,20 Z',
      b: 'M 82,12 L 82,72 L 76,66 L 76,22 Z',
      c: 'M 82,82 L 82,142 L 76,136 L 76,88 Z',
      d: 'M 20,144 L 80,144 L 75,134 L 25,134 Z',
      e: 'M 18,82 L 18,142 L 24,136 L 24,88 Z',
      f: 'M 18,12 L 18,72 L 24,66 L 24,22 Z',
      g: 'M 22,77 L 78,77 L 74,83 L 26,83 Z',
    };
    for (const [name, path] of Object.entries(segments)) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', path);
      p.setAttribute('class', 'seg seg-off');
      p.setAttribute('id', `seg-${name}`);
      svg.appendChild(p);
    }
    el.appendChild(svg);
  }

  _buildMonitor() {
    const el = this.devices.monitor.element;
    el.innerHTML = '<div class="io-device-title">🖥️ Text Monitor — INT 0x10 (AL = ASCII char)</div>';
    const screen = document.createElement('pre');
    screen.className = 'monitor-screen';
    screen.id = 'monitor-screen';
    screen.textContent = ''; 
    el.appendChild(screen);
  }

  _buildVideo() {
    const el = this.devices.video.element;
    const w = this.devices.video.width;
    const h = this.devices.video.height;
    el.innerHTML = `<div class="io-device-title">📺 Video Display (${w}×${h}) — INT 0x30</div>
      <div class="video-info">INT 0x30: AL=color, AH=X, BL=Y | INT 0x31: fill all with AL</div>`;
    
    // Initialize pixel array
    this.devices.video.pixels = new Uint8Array(w * h);

    // Canvas for performance
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.className = 'video-canvas';
    canvas.id = 'video-canvas';
    canvas.title = `${w}×${h} pixel display`;
    el.appendChild(canvas);

    this._renderVideo();
  }

  _buildConsole() {
    const el = this.devices.console.element;
    el.innerHTML = `<div class="io-device-title">⌨️ Input Console — INT 0x21 reads next char into AL</div>`;
    
    const inputArea = document.createElement('div');
    inputArea.className = 'console-area';

    const inputField = document.createElement('input');
    inputField.type = 'text';
    inputField.className = 'console-input';
    inputField.id = 'console-input';
    inputField.placeholder = 'Type input here, then run program...';
    inputField.title = 'Characters typed here become available via INT 0x21';
    
    const sendBtn = document.createElement('button');
    sendBtn.className = 'btn console-send-btn';
    sendBtn.textContent = '⏎ Send';
    sendBtn.id = 'console-send';

    // DIP switch row for TD4 input
    const dipRow = document.createElement('div');
    dipRow.className = 'dip-switch-row';
    dipRow.id = 'dip-switches';
    dipRow.innerHTML = '<div class="io-device-subtitle">4-bit DIP Switch (TD4 IN port)</div>';
    for (let i = 3; i >= 0; i--) {
      const sw = document.createElement('label');
      sw.className = 'dip-switch';
      sw.innerHTML = `<input type="checkbox" id="dip-${i}" data-bit="${i}"><span class="dip-slider"></span><span class="dip-label">${i}</span>`;
      dipRow.appendChild(sw);
    }
    const dipValue = document.createElement('span');
    dipValue.className = 'dip-value';
    dipValue.id = 'dip-value';
    dipValue.textContent = '0x0';
    dipRow.appendChild(dipValue);

    inputArea.appendChild(inputField);
    inputArea.appendChild(sendBtn);
    el.appendChild(inputArea);
    el.appendChild(dipRow);

    // Buffer incoming characters
    sendBtn.addEventListener('click', () => this._sendConsoleInput());
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._sendConsoleInput();
    });

    // DIP switches
    for (let i = 0; i < 4; i++) {
      const sw = document.getElementById(`dip-${i}`);
      if (sw) {
        sw.addEventListener('change', () => this._updateDIPValue());
      }
    }
  }

  _sendConsoleInput() {
    const inputField = document.getElementById('console-input');
    if (!inputField) return;
    const text = inputField.value;
    for (const ch of text) {
      this.devices.console.inputBuffer.push(ch.charCodeAt(0));
    }
    // Add newline
    this.devices.console.inputBuffer.push(10);
    inputField.value = '';
  }

  _updateDIPValue() {
    let val = 0;
    for (let i = 0; i < 4; i++) {
      const sw = document.getElementById(`dip-${i}`);
      if (sw && sw.checked) val |= (1 << i);
    }
    const display = document.getElementById('dip-value');
    if (display) display.textContent = `0x${val.toString(16)} (${val})`;
    return val;
  }

  getDIPValue() {
    return this._updateDIPValue();
  }

  // =================== INT HANDLERS ===================

  // INT 0x10 — print character in AL
  handleMonitorInt(cpu) {
    if (!this.devices.monitor.enabled) return;
    const ch = cpu.getRegisterValue('AL') & 0xFF;
    if (ch === 0) return;
    const char = String.fromCharCode(ch);
    if (char === '\n') {
      this.devices.monitor.buffer.push('\n');
      this.devices.monitor.cursorX = 0;
      this.devices.monitor.cursorY++;
    } else {
      this.devices.monitor.buffer.push(char);
      this.devices.monitor.cursorX++;
      if (this.devices.monitor.cursorX >= 40) {
        this.devices.monitor.buffer.push('\n');
        this.devices.monitor.cursorX = 0;
        this.devices.monitor.cursorY++;
      }
    }
    this._updateMonitor();
  }

  // INT 0x20 — write AL to LEDs
  handleLEDInt(cpu) {
    const val = cpu.getRegisterValue('AL') & 0xFF;
    this.setLEDs(val);
  }

  // INT 0x21 — read next char from console into AL
  handleConsoleReadInt(cpu) {
    if (!this.devices.console.enabled) return;
    if (this.devices.console.inputBuffer.length > 0) {
      const ch = this.devices.console.inputBuffer.shift();
      cpu.setRegisterValue('AL', ch);
    } else {
      cpu.setRegisterValue('AL', 0); // No input available
    }
  }

  // INT 0x22 — write AL to 7-segment display
  handle7SegInt(cpu) {
    const val = cpu.getRegisterValue('AL') & 0xF;
    this.set7Segment(val);
  }

  // INT 0x30 — set pixel: AL=color(0-15), AH=X, BL=Y
  handleVideoSetPixel(cpu) {
    if (!this.devices.video.enabled) return;
    const color = cpu.getRegisterValue('AL');
    const x = cpu.getRegisterValue('AH') || 0;
    const y = cpu.getRegisterValue('BL') || 0;
    const w = this.devices.video.width;
    const h = this.devices.video.height;
    
    // Strict error checking for out of bounds
    if (x < 0 || x >= w || y < 0 || y >= h) {
      throw new Error(`Video pixel out of bounds: Attempted to draw at (${x}, ${y}) but screen is ${w}x${h}`);
    }
    
    this.devices.video.pixels[y * w + x] = color & 0xF;
    this._renderVideo();
  }

  // INT 0x31 — fill entire screen with color in AL
  handleVideoFill(cpu) {
    if (!this.devices.video.enabled) return;
    const color = cpu.getRegisterValue('AL') & 0xF;
    this.devices.video.pixels.fill(color);
    this._renderVideo();
  }

  setLEDs(value) {
    if (!this.devices.leds.enabled) return;
    this.devices.leds.state = value & 0xFF;
    for (let i = 0; i < 8; i++) {
      const led = document.getElementById(`led-${i}`);
      if (led) {
        const on = (value >> i) & 1;
        led.className = on ? 'led on' : 'led off';
      }
    }
    const display = document.getElementById('led-value-display');
    if (display) {
      const bin = value.toString(2).padStart(8, '0');
      display.textContent = `0x${value.toString(16).padStart(2, '0').toUpperCase()} (${value}) = ${bin}b`;
    }
  }

  // TD4 mode: only 4 LEDs
  setLEDs4(value) {
    if (!this.devices.leds.enabled) return;
    this.devices.leds.state = value & 0xF;
    for (let i = 0; i < 8; i++) {
      const led = document.getElementById(`led-${i}`);
      if (led) {
        if (i < 4) {
          const on = (value >> i) & 1;
          led.className = on ? 'led on' : 'led off';
        } else {
          led.className = 'led off';
          led.style.opacity = '0.2';
        }
      }
    }
    const display = document.getElementById('led-value-display');
    if (display) {
      const bin = (value & 0xF).toString(2).padStart(4, '0');
      display.textContent = `0x${(value & 0xF).toString(16)} (${value & 0xF}) = ${bin}b`;
    }
  }

  set7Segment(value) {
    if (!this.devices.sevenSeg.enabled) return;
    this.devices.sevenSeg.state = value & 0xFF;
    const patterns = {
      0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
      5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
      10: 'abcefg', 11: 'cdefg', 12: 'adef', 13: 'bcdeg', 14: 'adefg', 15: 'adfg'
    };
    const digit = value & 0xF;
    const pattern = patterns[digit] || '';
    for (const seg of 'abcdefg') {
      const el = document.getElementById(`seg-${seg}`);
      if (el) el.setAttribute('class', pattern.includes(seg) ? 'seg seg-on' : 'seg seg-off');
    }
  }

  _renderVideo() {
    const canvas = document.getElementById('video-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = this.devices.video.width;
    const h = this.devices.video.height;
    const pixels = this.devices.video.pixels;
    
    // 16-color palette (CGA-inspired)
    const palette = [
      '#000000', '#0000AA', '#00AA00', '#00AAAA',
      '#AA0000', '#AA00AA', '#AA5500', '#AAAAAA',
      '#555555', '#5555FF', '#55FF55', '#55FFFF',
      '#FF5555', '#FF55FF', '#FFFF55', '#FFFFFF',
    ];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const colorIdx = pixels[y * w + x] & 0xF;
        ctx.fillStyle = palette[colorIdx];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  _updateMonitor() {
    const screen = document.getElementById('monitor-screen');
    if (screen) {
      screen.textContent = this.devices.monitor.buffer.join('');
      screen.scrollTop = screen.scrollHeight;
    }
  }

  reset() {
    this.devices.leds.state = 0;
    this.setLEDs(0);
    this.devices.sevenSeg.state = 0;
    this.set7Segment(0);
    this.devices.monitor.buffer = [];
    this.devices.monitor.cursorX = 0;
    this.devices.monitor.cursorY = 0;
    this._updateMonitor();
    if (this.devices.video.pixels) {
      this.devices.video.pixels.fill(0);
      this._renderVideo();
    }
    this.devices.console.inputBuffer = [];
    // Reset LED styles
    for (let i = 0; i < 8; i++) {
      const led = document.getElementById(`led-${i}`);
      if (led) led.style.opacity = '';
    }
  }

  // Register all IO handlers with the x86 CPU
  registerWithCPU(cpu) {
    cpu.registerIO(0x10, (c) => this.handleMonitorInt(c));
    cpu.registerIO(0x20, (c) => this.handleLEDInt(c));
    cpu.registerIO(0x21, (c) => this.handleConsoleReadInt(c));
    cpu.registerIO(0x22, (c) => this.handle7SegInt(c));
    cpu.registerIO(0x30, (c) => this.handleVideoSetPixel(c));
    cpu.registerIO(0x31, (c) => this.handleVideoFill(c));
  }
}
