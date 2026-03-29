// visualizer.js — SVG-based CPU visualization engine with 3 modes
// Mode 1: Block Diagram (high-level CPU architecture)
// Mode 2: Gate-Level (logic gates for current operation)
// Mode 3: Signal Trace (timing diagram / waveform view)

export class Visualizer {
  constructor(container) {
    this.container = container;
    this.mode = 'block'; // 'block', 'gate', 'trace'
    this.svg = null;
    this.activeComponents = new Set();
    this.animationQueue = [];
    this.signalTraceData = [];
    this.maxTracePoints = 60;
    this.cycleCount = 0;
    this.currentCycle = null;
    this.phaseDescriptionEl = null;
    this.build();
  }

  build() {
    this.container.innerHTML = '';
    this.container.className = 'visualizer-container';

    // Phase description bar at top
    this.phaseDescriptionEl = document.createElement('div');
    this.phaseDescriptionEl.className = 'phase-description';
    this.phaseDescriptionEl.id = 'phase-description';
    this.phaseDescriptionEl.textContent = 'Ready — Load a program and click Run or Step';
    this.container.appendChild(this.phaseDescriptionEl);

    // SVG container
    this.svgContainer = document.createElement('div');
    this.svgContainer.className = 'svg-container';
    this.svgContainer.id = 'svg-container';
    this.container.appendChild(this.svgContainer);

    this._buildBlockDiagram();
  }

  setMode(mode) {
    this.mode = mode;
    this.svgContainer.innerHTML = '';
    if (mode === 'block') this._buildBlockDiagram();
    else if (mode === 'gate') this._buildGateView();
    else if (mode === 'trace') this._buildTraceView();
    else if (mode === 'pcb') this._buildPCBView();
  }

  /***************
   * PCB LAYOUT
   ***************/
  _buildPCBView() {
    const svg = this._createSVG(900, 520);
    this.svg = svg;

    // Base PCB Board (Background)
    const board = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    board.setAttribute('width', 900);
    board.setAttribute('height', 520);
    board.setAttribute('class', 'pcb-board');
    svg.appendChild(board);

    // Add some vias for aesthetics
    for (let i=0; i<50; i++) {
        const via = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        via.setAttribute('cx', 20 + Math.random() * 860);
        via.setAttribute('cy', 20 + Math.random() * 480);
        via.setAttribute('r', 2);
        via.setAttribute('class', 'pcb-via');
        svg.appendChild(via);
    }

    // Helper to draw traces (L-shaped orthogonal lines)
    const drawTrace = (x1, y1, x2, y2) => {
        let path = `M ${x1} ${y1} L ${(x1+x2)/2} ${y1} L ${(x1+x2)/2} ${y2} L ${x2} ${y2}`;
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', path);
        p.setAttribute('class', 'pcb-trace');
        svg.appendChild(p);
    };

    // Helper to draw an IC
    const drawIC = (id, x, y, width, height, text, pinsX, pinsY) => {
        // Traces from pins logic (drawn beneath ICs)
        for (let i = 0; i < pinsX; i++) {
            const pinXOffset = x + 15 + i * 20;
            // top pins trace
            drawTrace(pinXOffset, y, pinXOffset, y - 20 - Math.random() * 40);
            // bottom pins trace
            drawTrace(pinXOffset, y + height, pinXOffset, y + height + 20 + Math.random() * 40);
        }
        for (let i = 0; i < pinsY; i++) {
            const pinYOffset = y + 15 + i * 20;
            // left pins trace
            drawTrace(x, pinYOffset, x - 20 - Math.random() * 40, pinYOffset);
            // right pins trace
            drawTrace(x + width, pinYOffset, x + width + 20 + Math.random() * 40, pinYOffset);
        }

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('id', `pcb-comp-${id}`);
        g.setAttribute('class', 'cpu-component');
        
        // Pins
        const drawPin = (px, py, pw, ph) => {
            const pin = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            pin.setAttribute('x', px);
            pin.setAttribute('y', py);
            pin.setAttribute('width', pw);
            pin.setAttribute('height', ph);
            pin.setAttribute('class', 'pcb-ic-pin');
            g.appendChild(pin);
        };
        
        // top/bottom pins
        for (let i = 0; i < pinsX; i++) {
            drawPin(x + 10 + i * 20, y - 5, 10, 10);
            drawPin(x + 10 + i * 20, y + height - 5, 10, 10);
        }
        // left/right pins
        for (let i = 0; i < pinsY; i++) {
            drawPin(x - 5, y + 10 + i * 20, 10, 10);
            drawPin(x + width - 5, y + 10 + i * 20, 10, 10);
        }

        // IC Body
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        rect.setAttribute('class', 'pcb-ic');
        g.appendChild(rect);

        // Label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', x + width/2);
        label.setAttribute('y', y + height/2);
        label.setAttribute('class', 'pcb-ic-label');
        label.textContent = text;
        g.appendChild(label);
        
        // Dot marker (pin 1)
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', x + 10);
        dot.setAttribute('cy', y + 10);
        dot.setAttribute('r', 3);
        dot.setAttribute('fill', '#444');
        g.appendChild(dot);

        svg.appendChild(g);
    };

    // Draw Traces to connect components
    drawTrace(220, 150, 400, 150);
    drawTrace(220, 250, 400, 150);
    drawTrace(550, 150, 700, 250);
    drawTrace(220, 350, 700, 350);
    
    // Create Layout
    drawIC('cu', 80, 80, 140, 140, 'Control Unit', 6, 6);
    drawIC('reg', 80, 280, 140, 160, 'Register File', 6, 7);
    
    drawIC('alu', 400, 120, 150, 140, 'ALU C5GX', 6, 6);
    drawIC('io', 400, 320, 150, 100, 'I/O Ctrl', 6, 4);

    drawIC('ram', 700, 160, 120, 240, 'DDR4 RAM', 5, 11);
    
    this.svgContainer.appendChild(svg);
  }

  /***************
   * BLOCK DIAGRAM
   ***************/
  _buildBlockDiagram() {
    const svg = this._createSVG(900, 520);
    this.svg = svg;

    // Background grid
    this._addGrid(svg, 900, 520);

    // ====== Buses (drawn first, behind components) ======
    // Data Bus (horizontal, through center)
    this._addBus(svg, 'data-bus', [
      {x: 80, y: 260}, {x: 820, y: 260}
    ], '#00e5ff', 'Data Bus');
    // Address Bus
    this._addBus(svg, 'address-bus', [
      {x: 80, y: 300}, {x: 820, y: 300}
    ], '#ffd740', 'Address Bus');
    // Control Bus
    this._addBus(svg, 'control-bus', [
      {x: 80, y: 340}, {x: 820, y: 340}
    ], '#ff4081', 'Control Bus');

    // Bus labels
    this._addText(svg, 450, 252, 'DATA BUS', 'bus-label data-bus-label', '#00e5ff');
    this._addText(svg, 450, 292, 'ADDRESS BUS', 'bus-label addr-bus-label', '#ffd740');
    this._addText(svg, 450, 332, 'CONTROL BUS', 'bus-label ctrl-bus-label', '#ff4081');

    // ====== Top Row: Control Unit + Instruction Decoder ======
    this._addComponent(svg, 'control-unit', 60, 30, 240, 100,
      'Control Unit (CU)', 'Fetches instructions, decodes them, and coordinates all CPU operations.',
      '#8b5cf6');
    this._addComponent(svg, 'instruction-decoder', 340, 30, 220, 100,
      'Instruction Decoder', 'Decodes the binary instruction into control signals that tell the CPU what to do.',
      '#a78bfa');

    // ====== Top Row Right: Clock ======
    this._addComponent(svg, 'clock', 600, 30, 130, 60,
      '⏱ Clock', 'Generates timing signals that synchronize all CPU operations.',
      '#64748b');

    // ====== Middle Row: Register File + ALU ======
    this._addComponent(svg, 'register-file', 60, 160, 200, 80,
      'Register File', 'Fast storage inside the CPU. Holds EAX, EBX, ECX, EDX, etc.',
      '#10b981');
    this._addComponent(svg, 'alu', 340, 160, 220, 80,
      'ALU (Arithmetic Logic Unit)', 'Performs math (+, -, ×, ÷) and logic (AND, OR, XOR) operations on data.',
      '#f59e0b');

    // ====== Right Side: Memory ======
    this._addComponent(svg, 'memory', 650, 140, 180, 120,
      'Memory (ROM/RAM)', 'Stores program instructions and data. ROM is read-only, RAM is read-write.',
      '#3b82f6');

    // ====== Bottom Row: Stack + IO ======
    this._addComponent(svg, 'stack', 60, 380, 180, 100,
      'Stack', 'LIFO memory for function calls, returns, and temporary data. ESP points to the top.',
      '#ec4899');
    this._addComponent(svg, 'io-bus', 340, 380, 220, 100,
      'I/O Controller', 'Manages communication with external devices: LEDs, display, monitor.',
      '#06b6d4');
    this._addComponent(svg, 'flags', 650, 380, 180, 100,
      'EFLAGS Register', 'Status flags set by the ALU: Zero (ZF), Carry (CF), Sign (SF), Overflow (OF).',
      '#f97316');

    // ====== Connection lines from components to buses ======
    // Register File → Data Bus
    this._addConnection(svg, 'conn-reg-data', 160, 240, 160, 260, '#00e5ff');
    // ALU → Data Bus
    this._addConnection(svg, 'conn-alu-data', 450, 240, 450, 260, '#00e5ff');
    // Memory → Data Bus
    this._addConnection(svg, 'conn-mem-data', 740, 260, 740, 260, '#00e5ff');
    // Memory ↔ Address Bus
    this._addConnection(svg, 'conn-mem-addr', 740, 300, 740, 300, '#ffd740');
    // CU → Control Bus
    this._addConnection(svg, 'conn-cu-ctrl', 180, 130, 180, 340, '#ff4081');
    // Stack → Data Bus
    this._addConnection(svg, 'conn-stack-data', 150, 380, 150, 260, '#00e5ff');
    // IO → Data Bus
    this._addConnection(svg, 'conn-io-data', 450, 380, 450, 340, '#06b6d4');
    // CU → Decoder
    this._addConnection(svg, 'conn-cu-decoder', 300, 80, 340, 80, '#a78bfa');
    // Decoder → ALU
    this._addConnection(svg, 'conn-decoder-alu', 450, 130, 450, 160, '#a78bfa');
    // ALU → Flags
    this._addConnection(svg, 'conn-alu-flags', 560, 220, 650, 430, '#f97316');

    // Signal animation particles (initially hidden)
    this._addSignalParticle(svg, 'signal-fetch', '#00e5ff');
    this._addSignalParticle(svg, 'signal-decode', '#a78bfa');
    this._addSignalParticle(svg, 'signal-execute', '#f59e0b');
    this._addSignalParticle(svg, 'signal-writeback', '#10b981');
    this._addSignalParticle(svg, 'signal-data', '#00e5ff');

    this.svgContainer.appendChild(svg);
  }

  _createSVG(w, h) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('class', 'cpu-svg');
    svg.setAttribute('id', 'cpu-svg');

    // Glow filter
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
      <filter id="glow-strong" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
    `;
    svg.appendChild(defs);
    return svg;
  }

  _addGrid(svg, w, h) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'grid');
    for (let x = 0; x < w; x += 20) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x); line.setAttribute('y1', 0);
      line.setAttribute('x2', x); line.setAttribute('y2', h);
      line.setAttribute('class', 'grid-line');
      g.appendChild(line);
    }
    for (let y = 0; y < h; y += 20) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', 0); line.setAttribute('y1', y);
      line.setAttribute('x2', w); line.setAttribute('y2', y);
      line.setAttribute('class', 'grid-line');
      g.appendChild(line);
    }
    svg.appendChild(g);
  }

  _addComponent(svg, id, x, y, w, h, title, description, color) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', `comp-${id}`);
    g.setAttribute('class', 'cpu-component');
    g.setAttribute('data-description', description);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('rx', 8);
    rect.setAttribute('class', 'comp-rect');
    rect.setAttribute('style', `stroke: ${color}; --comp-color: ${color}`);
    g.appendChild(rect);

    // Title
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + w / 2);
    text.setAttribute('y', y + h / 2 - 5);
    text.setAttribute('class', 'comp-title');
    text.setAttribute('fill', color);

    // Wrap title if too long
    const words = title.split(' ');
    if (words.length > 2 && title.length > 15) {
      const mid = Math.ceil(words.length / 2);
      const line1 = words.slice(0, mid).join(' ');
      const line2 = words.slice(mid).join(' ');
      const tspan1 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan1.setAttribute('x', x + w / 2);
      tspan1.setAttribute('dy', '-8');
      tspan1.textContent = line1;
      const tspan2 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan2.setAttribute('x', x + w / 2);
      tspan2.setAttribute('dy', '16');
      tspan2.textContent = line2;
      text.appendChild(tspan1);
      text.appendChild(tspan2);
    } else {
      text.textContent = title;
    }
    g.appendChild(text);

    // Tooltip on hover
    const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    titleEl.textContent = `${title}\n\n${description}`;
    g.appendChild(titleEl);

    svg.appendChild(g);
  }

  _addBus(svg, id, points, color, label) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', points[0].x);
    line.setAttribute('y1', points[0].y);
    line.setAttribute('x2', points[1].x);
    line.setAttribute('y2', points[1].y);
    line.setAttribute('class', 'bus-line');
    line.setAttribute('id', `bus-${id}`);
    line.setAttribute('style', `stroke: ${color}`);
    svg.appendChild(line);
  }

  _addConnection(svg, id, x1, y1, x2, y2, color) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('class', 'connection-line');
    line.setAttribute('id', id);
    line.setAttribute('style', `stroke: ${color}`);
    svg.appendChild(line);
  }

  _addText(svg, x, y, text, className, fill) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('class', className || '');
    t.setAttribute('fill', fill || '#fff');
    t.textContent = text;
    svg.appendChild(t);
  }

  _addSignalParticle(svg, id, color) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('id', id);
    circle.setAttribute('r', 5);
    circle.setAttribute('fill', color);
    circle.setAttribute('class', 'signal-particle hidden');
    circle.setAttribute('filter', 'url(#glow)');
    svg.appendChild(circle);
  }

  /***************
   * GATE-LEVEL VIEW
   ***************/
  _buildGateView() {
    const svg = this._createSVG(900, 520);
    this.svg = svg;
    this._addGrid(svg, 900, 520);

    // Title
    this._addText(svg, 450, 30, 'Gate-Level View — ALU Internal Circuit', 'view-title', '#00e5ff');

    // Show a full adder circuit with gates
    this._buildFullAdderCircuit(svg, 100, 60);

    // Show the operation info
    this.gateInfoText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    this.gateInfoText.setAttribute('x', 450);
    this.gateInfoText.setAttribute('y', 500);
    this.gateInfoText.setAttribute('class', 'gate-info-text');
    this.gateInfoText.setAttribute('fill', '#94a3b8');
    this.gateInfoText.textContent = 'Execute an ALU instruction to see gate activity';
    svg.appendChild(this.gateInfoText);

    this.svgContainer.appendChild(svg);
  }

  _buildFullAdderCircuit(svg, offsetX, offsetY) {
    // 8-bit ripple carry adder made of full adders
    // Show 4 bits for clarity
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', 'adder-circuit');

    for (let bit = 0; bit < 4; bit++) {
      const x = offsetX + bit * 180;
      const y = offsetY + 60;
      this._drawFullAdder(g, `fa-${bit}`, x, y, bit);
    }

    // Input labels
    this._addText(g, offsetX, offsetY + 30, 'Input A (bits)', 'gate-label', '#10b981');
    this._addText(g, offsetX, offsetY + 50, 'Input B (bits)', 'gate-label', '#3b82f6');

    // Carry chain
    for (let bit = 0; bit < 3; bit++) {
      const x1 = offsetX + bit * 180 + 140;
      const x2 = offsetX + (bit + 1) * 180 + 10;
      const y = offsetY + 180;
      const carryLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      carryLine.setAttribute('x1', x1);
      carryLine.setAttribute('y1', y);
      carryLine.setAttribute('x2', x2);
      carryLine.setAttribute('y2', y);
      carryLine.setAttribute('class', 'gate-wire carry-wire');
      carryLine.setAttribute('id', `carry-${bit}-${bit + 1}`);
      carryLine.setAttribute('style', 'stroke: #f59e0b');
      g.appendChild(carryLine);
    }

    svg.appendChild(g);

    // Bit value display boxes
    for (let bit = 0; bit < 4; bit++) {
      const x = offsetX + bit * 180 + 60;
      // Input A bit
      this._addBitBox(svg, `bit-a-${bit}`, x, offsetY + 310, '0', '#10b981');
      // Input B bit
      this._addBitBox(svg, `bit-b-${bit}`, x, offsetY + 340, '0', '#3b82f6');
      // Sum bit
      this._addBitBox(svg, `bit-s-${bit}`, x, offsetY + 380, '0', '#00e5ff');
    }

    this._addText(svg, offsetX, offsetY + 322, 'A:', 'bit-label', '#10b981');
    this._addText(svg, offsetX, offsetY + 352, 'B:', 'bit-label', '#3b82f6');
    this._addText(svg, offsetX, offsetY + 392, 'Sum:', 'bit-label', '#00e5ff');
  }

  _drawFullAdder(parent, id, x, y, bitIndex) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', id);
    g.setAttribute('class', 'full-adder');

    // XOR gate (for sum)
    this._drawGate(g, `${id}-xor1`, x + 20, y + 20, 'XOR', '#00e5ff');
    // AND gate (for carry)
    this._drawGate(g, `${id}-and1`, x + 20, y + 100, 'AND', '#f59e0b');

    // Full adder box
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', 140);
    rect.setAttribute('height', 200);
    rect.setAttribute('rx', 6);
    rect.setAttribute('class', 'adder-box');
    rect.setAttribute('id', `${id}-box`);
    g.appendChild(rect);

    // Label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + 70);
    text.setAttribute('y', y + 15);
    text.setAttribute('class', 'adder-label');
    text.setAttribute('fill', '#94a3b8');
    text.textContent = `Bit ${bitIndex}`;
    g.appendChild(text);

    // Input pins
    this._addPin(g, `${id}-a`, x, y + 40, 'A', 'input');
    this._addPin(g, `${id}-b`, x, y + 80, 'B', 'input');
    this._addPin(g, `${id}-cin`, x + 10, y + 200, 'Cin', 'input');

    // Output pins
    this._addPin(g, `${id}-s`, x + 140, y + 60, 'S', 'output');
    this._addPin(g, `${id}-cout`, x + 140, y + 160, 'Cout', 'output');

    parent.appendChild(g);
  }

  _drawGate(parent, id, x, y, type, color) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', id);
    g.setAttribute('class', `logic-gate gate-${type.toLowerCase()}`);

    const body = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    body.setAttribute('x', x);
    body.setAttribute('y', y);
    body.setAttribute('width', 80);
    body.setAttribute('height', 40);
    body.setAttribute('rx', type === 'AND' ? 4 : 20);
    body.setAttribute('class', 'gate-body');
    body.setAttribute('style', `stroke: ${color}`);
    g.appendChild(body);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', x + 40);
    label.setAttribute('y', y + 25);
    label.setAttribute('class', 'gate-label-text');
    label.setAttribute('fill', color);
    label.textContent = type;
    g.appendChild(label);

    parent.appendChild(g);
  }

  _addPin(parent, id, x, y, label, type) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', 4);
    circle.setAttribute('class', `pin pin-${type}`);
    circle.setAttribute('id', `pin-${id}`);
    parent.appendChild(circle);
  }

  _addBitBox(svg, id, x, y, value, color) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', id);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', 24);
    rect.setAttribute('height', 24);
    rect.setAttribute('rx', 3);
    rect.setAttribute('class', 'bit-box');
    rect.setAttribute('style', `stroke: ${color}`);
    g.appendChild(rect);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + 12);
    text.setAttribute('y', y + 17);
    text.setAttribute('class', 'bit-value');
    text.setAttribute('fill', color);
    text.textContent = value;
    g.appendChild(text);

    svg.appendChild(g);
  }

  /***************
   * SIGNAL TRACE VIEW
   ***************/
  _buildTraceView() {
    const svg = this._createSVG(900, 520);
    this.svg = svg;

    this._addText(svg, 450, 30, 'Signal Trace — Timing Diagram', 'view-title', '#00e5ff');

    // Signal channels
    const channels = [
      { name: 'CLK', color: '#64748b', y: 60 },
      { name: 'Data Bus', color: '#00e5ff', y: 140 },
      { name: 'Addr Bus', color: '#ffd740', y: 220 },
      { name: 'ALU Active', color: '#f59e0b', y: 300 },
      { name: 'Mem R/W', color: '#3b82f6', y: 380 },
      { name: 'I/O', color: '#06b6d4', y: 450 },
    ];

    for (const ch of channels) {
      // Channel label
      this._addText(svg, 10, ch.y + 30, ch.name, 'trace-label', ch.color);

      // Baseline
      const baseline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      baseline.setAttribute('x1', 100);
      baseline.setAttribute('y1', ch.y + 50);
      baseline.setAttribute('x2', 880);
      baseline.setAttribute('y2', ch.y + 50);
      baseline.setAttribute('class', 'trace-baseline');
      baseline.setAttribute('style', `stroke: ${ch.color}22`);
      svg.appendChild(baseline);

      // Waveform path (initially flat)
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      path.setAttribute('id', `trace-${ch.name.replace(/[^a-zA-Z]/g, '')}`);
      path.setAttribute('class', 'trace-wave');
      path.setAttribute('style', `stroke: ${ch.color}`);
      path.setAttribute('points', `100,${ch.y + 50} 880,${ch.y + 50}`);
      path.setAttribute('fill', 'none');
      svg.appendChild(path);
    }

    this.svgContainer.appendChild(svg);
  }

  /***************
   * ANIMATION / UPDATE
   ***************/
  animateCycle(cycleInfo) {
    if (!cycleInfo) return;
    this.currentCycle = cycleInfo;
    this.cycleCount++;

    // Update phase description
    if (this.phaseDescriptionEl && cycleInfo.phases.length > 0) {
      const lastPhase = cycleInfo.phases[cycleInfo.phases.length - 1];
      const execPhase = cycleInfo.phases.find(p => p.name === 'execute');
      this.phaseDescriptionEl.innerHTML = `
        <span class="phase-badge phase-${execPhase ? 'execute' : lastPhase.name}">${(execPhase || lastPhase).name.toUpperCase()}</span>
        <span class="phase-text">${(execPhase || lastPhase).description}</span>
      `;
    }

    if (this.mode === 'block') this._animateBlock(cycleInfo);
    else if (this.mode === 'gate') this._animateGate(cycleInfo);
    else if (this.mode === 'trace') this._animateTrace(cycleInfo);
      else if (this.mode === 'pcb') this._animatePCB(cycleInfo);
    }

    _animatePCB(cycle) {
      this._clearActive();

      const execPhase = cycle.phases.find(p => p.name === 'execute');
      const component = execPhase?.component;

      let activeICs = ['cu']; // control unit always active
      
      if (component === 'alu') activeICs.push('alu', 'reg');
      else if (component === 'memory') activeICs.push('ram', 'reg');
      else if (component === 'io') activeICs.push('io', 'reg');
      else activeICs.push('reg');

      activeICs.forEach(id => {
          const ic = document.getElementById(`pcb-comp-${id}`);
          if (ic) ic.classList.add('pcb-comp-active');
      });

      const traces = document.querySelectorAll('.pcb-trace');
      traces.forEach(t => {
          // Add some randomness so they don't all look uniform
          t.style.animationDelay = `-${Math.random()}s`;
          t.classList.add('pcb-active-trace');
      });
    }

    _animateBlock(cycle) {      this._clearActive();
      const execPhase = cycle.phases.find(p => p.name === 'execute');
      const component = execPhase?.component;
    // Always active: Control Unit (fetch), Instruction Decoder (decode)
    this._activateComponent('control-unit');
    this._activateComponent('instruction-decoder');

    // Activate specific components
    if (component === 'alu') {
      this._activateComponent('alu');
      this._activateComponent('register-file');
      this._pulseConnection('conn-reg-data');
      this._pulseConnection('conn-alu-data');
      this._pulseBus('data-bus');
    } else if (component === 'memory') {
      this._activateComponent('memory');
      this._activateComponent('stack');
      this._pulseBus('data-bus');
      this._pulseBus('address-bus');
      this._pulseConnection('conn-mem-data');
      this._pulseConnection('conn-stack-data');
    } else if (component === 'control') {
      this._activateComponent('register-file');
      this._pulseBus('control-bus');
      this._pulseConnection('conn-cu-ctrl');
    } else if (component === 'io') {
      this._activateComponent('io-bus');
      this._pulseBus('data-bus');
      this._pulseConnection('conn-io-data');
    }

    // If registers modified, highlight register file
    if (cycle.registersModified.length > 0) {
      this._activateComponent('register-file');
    }

    // If memory accessed, highlight memory
    if (cycle.memoryAccessed.length > 0) {
      this._activateComponent('memory');
    }

    // If flags were updated (CMP, ADD, SUB, etc.), highlight flags
    const mnemonic = cycle.instruction?.mnemonic?.toUpperCase();
    const flagOps = ['ADD', 'SUB', 'CMP', 'AND', 'OR', 'XOR', 'INC', 'DEC', 'MUL', 'DIV', 'SHL', 'SHR'];
    if (flagOps.includes(mnemonic)) {
      this._activateComponent('flags');
      this._pulseConnection('conn-alu-flags');
    }

    // Animate signal particles
    this._animateSignalParticle('signal-fetch', 'memory', 'control-unit');
    if (component === 'alu') {
      this._animateSignalParticle('signal-execute', 'register-file', 'alu');
      this._animateSignalParticle('signal-data', 'alu', 'register-file');
    }
  }

  _activateComponent(id) {
    const el = document.getElementById(`comp-${id}`);
    if (el) {
      el.classList.add('active');
      this.activeComponents.add(id);
    }
  }

  _pulseBus(id) {
    const el = document.getElementById(`bus-${id}`);
    if (el) el.classList.add('pulse');
  }

  _pulseConnection(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('pulse');
  }

  _animateSignalParticle(particleId, fromComp, toComp) {
    const particle = document.getElementById(particleId);
    if (!particle) return;
    const from = document.getElementById(`comp-${fromComp}`);
    const to = document.getElementById(`comp-${toComp}`);
    if (!from || !to) return;

    const fromRect = from.querySelector('rect');
    const toRect = to.querySelector('rect');
    if (!fromRect || !toRect) return;

    const x1 = parseFloat(fromRect.getAttribute('x')) + parseFloat(fromRect.getAttribute('width')) / 2;
    const y1 = parseFloat(fromRect.getAttribute('y')) + parseFloat(fromRect.getAttribute('height')) / 2;
    const x2 = parseFloat(toRect.getAttribute('x')) + parseFloat(toRect.getAttribute('width')) / 2;
    const y2 = parseFloat(toRect.getAttribute('y')) + parseFloat(toRect.getAttribute('height')) / 2;

    particle.classList.remove('hidden');
    particle.setAttribute('cx', x1);
    particle.setAttribute('cy', y1);

    // Animate
    particle.animate([
      { cx: x1, cy: y1, opacity: 1 },
      { cx: x2, cy: y2, opacity: 0.3 }
    ], {
      duration: 600,
      easing: 'ease-out'
    }).onfinish = () => {
      particle.setAttribute('cx', x2);
      particle.setAttribute('cy', y2);
    };
  }

  _clearActive() {
    for (const id of this.activeComponents) {
      const el = document.getElementById(`comp-${id}`);
      if (el) el.classList.remove('active');
    }
    this.activeComponents.clear();
    // Clear bus pulses
    document.querySelectorAll('.pulse').forEach(el => el.classList.remove('pulse'));
    // Hide particles
    document.querySelectorAll('.signal-particle').forEach(el => el.classList.add('hidden'));
    
    // Clear PCB specific active states
    document.querySelectorAll('.pcb-active-trace').forEach(t => t.classList.remove('pcb-active-trace'));
    document.querySelectorAll('.pcb-comp-active').forEach(c => c.classList.remove('pcb-comp-active'));
  }

  _animateGate(cycle) {
    if (!cycle.instruction) return;
    const mnemonic = cycle.instruction.mnemonic.toUpperCase();
    const execPhase = cycle.phases.find(p => p.name === 'execute');

    // Update gate info text
    if (this.gateInfoText) {
      this.gateInfoText.textContent = execPhase?.description || mnemonic;
    }

    // Get data flow values and show on bits
    if (cycle.dataFlow.length >= 1) {
      const value = cycle.dataFlow[0]?.value || 0;
      for (let bit = 0; bit < 4; bit++) {
        const bitVal = (value >> bit) & 1;
        const box = document.getElementById(`bit-a-${bit}`);
        if (box) {
          const text = box.querySelector('.bit-value');
          if (text) text.textContent = bitVal;
        }
      }
    }
    if (cycle.dataFlow.length >= 2) {
      const value = cycle.dataFlow[1]?.value || 0;
      for (let bit = 0; bit < 4; bit++) {
        const bitVal = (value >> bit) & 1;
        const box = document.getElementById(`bit-b-${bit}`);
        if (box) {
          const text = box.querySelector('.bit-value');
          if (text) text.textContent = bitVal;
        }
      }
    }
    // Result
    if (cycle.dataFlow.length >= 3) {
      const value = cycle.dataFlow[2]?.value || 0;
      for (let bit = 0; bit < 4; bit++) {
        const bitVal = (value >> bit) & 1;
        const box = document.getElementById(`bit-s-${bit}`);
        if (box) {
          const text = box.querySelector('.bit-value');
          if (text) text.textContent = bitVal;
        }
      }
    }

    // Highlight active gates
    const isArith = ['ADD', 'SUB', 'INC', 'DEC'].includes(mnemonic);
    const isLogic = ['AND', 'OR', 'XOR', 'NOT'].includes(mnemonic);

    document.querySelectorAll('.full-adder').forEach(fa => {
      fa.classList.toggle('active', isArith);
    });
    document.querySelectorAll('.gate-body').forEach(gb => {
      gb.classList.toggle('gate-active', isArith || isLogic);
    });
    document.querySelectorAll('.carry-wire').forEach(cw => {
      cw.classList.toggle('wire-active', isArith);
    });
    document.querySelectorAll('.adder-box').forEach(ab => {
      ab.classList.toggle('box-active', isArith || isLogic);
    });
  }

  _animateTrace(cycle) {
    // Add data point to trace
    const tracePoint = {
      cycle: this.cycleCount,
      clock: 1,
      dataBus: cycle.busActivity?.data ? 1 : 0,
      addrBus: cycle.busActivity?.address ? 1 : 0,
      alu: cycle.phases.some(p => p.component === 'alu') ? 1 : 0,
      memory: cycle.memoryAccessed?.length > 0 ? 1 : 0,
      io: cycle.phases.some(p => p.component === 'io') ? 1 : 0,
    };
    this.signalTraceData.push(tracePoint);
    if (this.signalTraceData.length > this.maxTracePoints) {
      this.signalTraceData.shift();
    }

    // Update waveforms
    const channels = [
      { key: 'clock', id: 'CLK', y: 60 },
      { key: 'dataBus', id: 'DataBus', y: 140 },
      { key: 'addrBus', id: 'AddrBus', y: 220 },
      { key: 'alu', id: 'ALUActive', y: 300 },
      { key: 'memory', id: 'MemRW', y: 380 },
      { key: 'io', id: 'IO', y: 450 },
    ];

    const xStart = 100;
    const xEnd = 880;
    const xRange = xEnd - xStart;
    const step = xRange / this.maxTracePoints;

    for (const ch of channels) {
      const polyline = document.getElementById(`trace-${ch.id}`);
      if (!polyline) continue;

      let points = '';
      for (let i = 0; i < this.signalTraceData.length; i++) {
        const data = this.signalTraceData[i];
        const x = xStart + i * step;
        let val = data[ch.key];

        // Clock is a square wave
        if (ch.key === 'clock') {
          const high = ch.y + 10;
          const low = ch.y + 50;
          points += `${x},${low} ${x},${high} ${x + step / 2},${high} ${x + step / 2},${low} `;
        } else {
          const high = ch.y + 10;
          const low = ch.y + 50;
          const y = val ? high : low;
          if (i > 0) {
            const prevVal = this.signalTraceData[i - 1][ch.key];
            if (prevVal !== val) {
              points += `${x},${prevVal ? high : low} `;
            }
          }
          points += `${x},${y} ${x + step},${y} `;
        }
      }
      polyline.setAttribute('points', points);
    }
  }

  setHalted() {
    if (this.phaseDescriptionEl) {
      this.phaseDescriptionEl.innerHTML = `
        <span class="phase-badge phase-halt">HALTED</span>
        <span class="phase-text">CPU execution has stopped (HLT instruction or end of program)</span>
      `;
    }
    this._clearActive();
  }

  reset() {
    this._clearActive();
    this.signalTraceData = [];
    this.cycleCount = 0;
    this.currentCycle = null;
    if (this.phaseDescriptionEl) {
      this.phaseDescriptionEl.textContent = 'Ready — Load a program and click Run or Step';
    }
    // Rebuild current view
    this.setMode(this.mode);
  }
}
