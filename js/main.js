// main.js — Application bootstrap and runtime controller
// Supports switching between x86 and TD4 architectures
import { CPU } from './cpu.js';
import { assemble, MNEMONICS, ALL_REGISTERS } from './assembler.js';
import { TD4CPU } from './cpu-td4.js';
import { assembleTD4, tokenizeLineTD4, TD4_EXAMPLES, TD4_MNEMONICS } from './assembler-td4.js';
import { Editor } from './editor.js';
import { Visualizer } from './visualizer.js';
import { IODevices } from './io-devices.js';
import EXAMPLES from './examples.js';
import { ChatAssistant } from './chat.js';

// Architecture info for tooltips
const ARCH_INFO = {
  x86: {
    name: 'x86 (Intel)',
    shortDesc: 'Complex Instruction Set Computer (CISC)',
    history: `<h4>x86 Architecture History</h4>
<p><strong>1978 — Intel 8086</strong>: The original 16-bit processor that started it all. Used in the IBM PC. 29,000 transistors, 5-10 MHz.</p>
<p><strong>1985 — 80386 (i386)</strong>: First 32-bit x86 CPU. Introduced protected mode, virtual memory, and paging. 275,000 transistors.</p>
<p><strong>1993 — Pentium</strong>: Superscalar pipeline, 3.1 million transistors, up to 66 MHz.</p>
<p><strong>2003 — AMD64</strong>: AMD extended x86 to 64-bit (x86-64/AMD64). Intel later adopted it as "Intel 64" (EM64T).</p>
<p><strong>Today</strong>: Modern x86-64 processors (Intel Core, AMD Ryzen) have billions of transistors, run at 5+ GHz, with multiple cores, out-of-order execution, branch prediction, and speculative execution.</p>
<p><strong>Key feature</strong>: Backward compatible — a modern AMD Ryzen can still run 8086 code from 1978!</p>
<p class="arch-note">This simulator implements a simplified subset of Intel-syntax x86 for educational purposes.</p>`,
  },
  td4: {
    name: 'TD4 (4-bit)',
    shortDesc: 'Minimal TTL CPU — 13 ICs',
    history: `<h4>TD4 Architecture History</h4>
<p><strong>Origin</strong>: Designed by <strong>Kaoru Tonami</strong> in the book <em>"CPU no Tsukurikata"</em> (How to Build a CPU), published in Japan. One of the most famous educational CPU designs.</p>
<p><strong>Hardware</strong>: Based on <strong>MuseLab/wuxx's</strong> PCB implementation (v1.3). Uses only <strong>13 TTL logic chips</strong>:</p>
<ul>
  <li><strong>74HC161 ×4</strong> — 4-bit counters (registers A, B, PC, OUT)</li>
  <li><strong>74HC283</strong> — 4-bit binary full adder (the entire ALU!)</li>
  <li><strong>74HC153 ×2</strong> — 4-to-1 multiplexers (ALU input selection)</li>
  <li><strong>74HC154</strong> — 4-to-16 decoder (ROM address)</li>
  <li><strong>74HC74</strong> — D flip-flop (clock/carry)</li>
  <li><strong>74HC14</strong> — Schmitt inverters (clock generator)</li>
  <li><strong>74HC32</strong> — OR gates (control logic)</li>
  <li><strong>74HC10</strong> — NAND gates (control logic)</li>
  <li><strong>74HC540</strong> — Octal buffer (output)</li>
</ul>
<p><strong>ROM</strong>: 128 diodes (1N4148) forming a 16-byte diode matrix, programmed via 48 DIP switches!</p>
<p><strong>Specs</strong>: 4-bit data, 4-bit address (16 bytes), 2 registers (A, B), only ADD/MOV/IN/OUT/JMP/JZ instructions. No subtract, no AND/OR — just the bare essentials to understand how a CPU works.</p>
<p class="arch-note">This simulator accurately models the TD4's control signals (SEL_A, SEL_B, #LOAD0-3) as described in the official instruction table.</p>`,
  }
};

class App {
  constructor() {
    this.architecture = 'x86'; // 'x86' or 'td4'
    this.cpu = new CPU(256, false);
    this.td4 = new TD4CPU(32);
    this.editor = null;
    this.visualizer = null;
    this.ioDevices = null;
    this.running = false;
    this.speed = 500;
    this.runTimer = null;
    this.assembled = false;
    this.errors = [];
    this.init();
  }

  init() {
    // Editor
    this.editor = new Editor(document.getElementById('editor-panel'));
    window.editor = this.editor; // Expose for ChatAssistant
    window.app = this; // Expose app for ChatAssistant to get current arch

    this.editor.onBreakpointChange = (bps) => {
      this.cpu.breakpoints = bps;
    };

    // Chat Assistant
    this.chatAssistant = new ChatAssistant();

    // Visualizer
    this.visualizer = new Visualizer(document.getElementById('visualizer-panel'));

    // IO Devices
    this.ioDevices = new IODevices(document.getElementById('io-panel'));
    this.ioDevices.registerWithCPU(this.cpu);

    // Controls
    this._setupControls();
    this._setupExamples();
    this._setupDocumentation();
    this._setupRegisterView();
    this._setupMemoryView();
    this._setupArchitectureInfo();

    // Load first example
    this.editor.setValue(EXAMPLES[0].code);
    this._updateStatus('Ready — write or load an assembly program');
  }

  _setupControls() {
    document.getElementById('btn-run').addEventListener('click', () => this._run());
    document.getElementById('btn-step').addEventListener('click', () => this._step());
    document.getElementById('btn-pause').addEventListener('click', () => this._pause());
    document.getElementById('btn-reset').addEventListener('click', () => this._reset());
    document.getElementById('btn-assemble').addEventListener('click', () => this._assemble());

    // Speed slider
    const speedSlider = document.getElementById('speed-slider');
    const speedLabel = document.getElementById('speed-label');
    speedSlider.addEventListener('input', (e) => {
      this.speed = parseInt(e.target.value);
      speedLabel.textContent = `${this.speed}ms`;
    });

    // Visualization mode
    document.getElementById('viz-mode').addEventListener('change', (e) => {
      this.visualizer.setMode(e.target.value);
    });

    // Memory size
    document.getElementById('mem-size').addEventListener('change', (e) => {
      const size = parseInt(e.target.value);
      if (this.architecture === 'td4') {
        this.td4.memorySize = size;
        this.td4.reset();
      } else {
        this.cpu.setMemorySize(size);
      }
      this._updateMemoryView();
      this._updateRegisterView();
      this._updateStatus(`Memory size changed to ${size} bytes`);
    });

    // ROM/RAM toggle
    document.getElementById('rom-ram-toggle').addEventListener('change', (e) => {
      const isROM = e.target.checked;
      this.cpu.setROMMode(isROM);
      document.getElementById('rom-ram-label').textContent = isROM ? 'ROM' : 'RAM';
      this._updateStatus(`Memory mode: ${isROM ? 'ROM (read-only)' : 'RAM (read-write)'}`);
    });

    // Architecture toggle
    document.getElementById('arch-select').addEventListener('change', (e) => {
      this._switchArchitecture(e.target.value);
    });

    // Architecture info button
    document.getElementById('arch-info-btn').addEventListener('click', () => {
      const modal = document.getElementById('arch-info-modal');
      if (modal) modal.classList.toggle('visible');
    });

    // Close modal
    document.getElementById('arch-info-close')?.addEventListener('click', () => {
      document.getElementById('arch-info-modal').classList.remove('visible');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        // Only handle specific shortcuts when in textarea
        if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); this._run(); }
        if (e.key === 'F5') { e.preventDefault(); this._assemble(); }
        return;
      }
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); this._run(); }
      if (e.key === 'F10') { e.preventDefault(); this._step(); }
      if (e.key === 'Escape') { e.preventDefault(); this._pause(); }
      if (e.key === 'F5') { e.preventDefault(); this._assemble(); }
    });

    // Tab switching for info panel
    document.querySelectorAll('.info-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.info-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.info-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.add('active');
      });
    });
  }

  _switchArchitecture(arch) {
    this._pause();
    this.architecture = arch;
    this.assembled = false;

    // Update UI for architecture
    const isTD4 = arch === 'td4';
    
    // Show/hide x86-specific options
    const romToggle = document.getElementById('rom-ram-toggle');
    if (romToggle && romToggle.parentElement) {
      romToggle.parentElement.style.display = isTD4 ? 'none' : 'flex';
    }
    
    // Update memory dropdown
    const memSize = document.getElementById('mem-size');
    if (isTD4) {
      memSize.innerHTML = '<option value="16">16 B (128 bits)</option><option value="32" selected>32 B (256 bits)</option>';
    } else {
      memSize.innerHTML = '<option value="256" selected>256 B</option><option value="512">512 B</option><option value="1024">1 KB</option><option value="4096">4 KB</option>';
    }
    
    // Update arch info
    this._updateArchInfo();

    // Reload examples
    this._setupExamples();

    // Reset and switch CPU
    if (isTD4) {
      this.td4.reset();
      this.editor.setValue(TD4_EXAMPLES[0].code);
      document.getElementById('example-description').textContent = TD4_EXAMPLES[0].description;
    } else {
      this.cpu.reset();
      this.editor.setValue(EXAMPLES[0].code);
      document.getElementById('example-description').textContent = EXAMPLES[0].description;
    }

    this.ioDevices.reset();
    this.visualizer.reset();
    this.editor.clearCurrentLine();
    this._setupRegisterView();
    this._updateRegisterView();
    this._setupMemoryView();
    this._updateMemoryView();
    this._setupDocumentation();
    this._updateStatus(`Switched to ${ARCH_INFO[arch].name} architecture`);
  }

  _setupExamples() {
    const select = document.getElementById('example-select');
    select.innerHTML = '';
    const examples = this.architecture === 'td4' ? TD4_EXAMPLES : EXAMPLES;
    for (let i = 0; i < examples.length; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = examples[i].name;
      select.appendChild(opt);
    }
    select.onchange = (e) => {
      const idx = parseInt(e.target.value);
      if (idx >= 0 && idx < examples.length) {
        this.editor.setValue(examples[idx].code);
        this._reset();
        this._updateStatus(`Loaded example: ${examples[idx].name}`);
        document.getElementById('example-description').textContent = examples[idx].description;
      }
    };
  }

  _assemble() {
    const code = this.editor.getValue();
    
    if (this.architecture === 'td4') {
      return this._assembleTD4(code);
    }

    const result = assemble(code);
    this.errors = result.errors;

    if (result.errors.length > 0) {
      this._updateStatus(`❌ Assembly errors: ${result.errors.map(e => `Line ${e.line}: ${e.message}`).join('; ')}`);
      this.assembled = false;
      return false;
    }

    this.cpu.loadProgram(result.instructions, result.labelMap);
    this.ioDevices.registerWithCPU(this.cpu);
    this.assembled = true;
    this.editor.clearCurrentLine();
    this._updateRegisterView();
    this._updateMemoryView();
    this._updateStatus(`✅ Assembled successfully: ${result.instructions.length} instructions`);
    return true;
  }

  _assembleTD4(code) {
    const result = assembleTD4(code, this.td4.memorySize);
    this.errors = result.errors;

    if (result.errors.length > 0) {
      this._updateStatus(`❌ Assembly errors: ${result.errors.map(e => `Line ${e.line}: ${e.message}`).join('; ')}`);
      this.assembled = false;
      return false;
    }

    this.td4.loadProgram(result.instructions);
    // Set input from DIP switches
    this.td4.setInput(this.ioDevices.getDIPValue());
    // Register TD4 output handler
    this.td4.ioHandlers.output = (val) => {
      this.ioDevices.setLEDs4(val);
      this.ioDevices.set7Segment(val);
    };

    this.assembled = true;
    this.editor.clearCurrentLine();
    this._updateRegisterView();
    this._updateMemoryView();
    this._updateStatus(`✅ Assembled: ${result.instructions.length}/16 ROM bytes`);
    return true;
  }

  _run() {
    if (!this.assembled) {
      if (!this._assemble()) return;
    }
    const cpu = this.architecture === 'td4' ? this.td4 : this.cpu;
    if (cpu.halted) {
      this._updateStatus('CPU is halted. Click Reset to restart.');
      return;
    }
    this.running = true;
    this._updateButtonStates();
    this._updateStatus('▶ Running...');
    this._runLoop();
  }

  _runLoop() {
    const cpu = this.architecture === 'td4' ? this.td4 : this.cpu;
    if (!this.running || cpu.halted) {
      if (cpu.halted) {
        this.running = false;
        this._updateButtonStates();
        this.visualizer.setHalted();
        this._updateStatus('⏹ CPU halted');
      }
      return;
    }

    // Check breakpoint (x86 only)
    if (this.architecture === 'x86') {
      const eip = this.cpu.registers.EIP;
      if (eip < this.cpu.instructions.length) {
        const currentLine = this.cpu.instructions[eip].line;
        if (this.cpu.breakpoints.has(currentLine)) {
          this._pause();
          this._updateStatus(`⏸ Breakpoint hit at line ${currentLine}`);
          this.editor.setCurrentLine(currentLine);
          return;
        }
      }
    }

    this._executeOne();
    this.runTimer = setTimeout(() => this._runLoop(), this.speed);
  }

  _step() {
    if (!this.assembled) {
      if (!this._assemble()) return;
    }
    const cpu = this.architecture === 'td4' ? this.td4 : this.cpu;
    if (cpu.halted) {
      this._updateStatus('CPU is halted. Click Reset to restart.');
      return;
    }
    this._executeOne();
    if (cpu.halted) {
      this.visualizer.setHalted();
      this._updateStatus('⏹ CPU halted');
    }
  }

  _executeOne() {
    // Update TD4 input from DIP switches before each step
    if (this.architecture === 'td4') {
      this.td4.setInput(this.ioDevices.getDIPValue());
    }

    const cpu = this.architecture === 'td4' ? this.td4 : this.cpu;
    const cycle = cpu.step();
    if (cycle) {
      this.editor.setCurrentLine(cycle.sourceLine);
      this.visualizer.animateCycle(cycle);
      this._updateRegisterView();
      this._updateMemoryView();
    }
  }

  _pause() {
    this.running = false;
    if (this.runTimer) {
      clearTimeout(this.runTimer);
      this.runTimer = null;
    }
    this._updateButtonStates();
    this._updateStatus('⏸ Paused');
  }

  _reset() {
    this._pause();
    if (this.architecture === 'td4') {
      this.td4.reset();
    } else {
      this.cpu.reset();
    }
    this.assembled = false;
    this.ioDevices.reset();
    this.visualizer.reset();
    this.editor.clearCurrentLine();
    this._updateRegisterView();
    this._updateMemoryView();
    this._updateButtonStates();
    this._updateStatus('🔄 Reset — ready');
  }

  _updateButtonStates() {
    document.getElementById('btn-run').disabled = this.running;
    document.getElementById('btn-step').disabled = this.running;
    document.getElementById('btn-pause').disabled = !this.running;
  }

  _updateStatus(msg) {
    const el = document.getElementById('status-bar');
    if (el) el.textContent = msg;
  }

  _setupRegisterView() {
    const container = document.getElementById('register-view');
    if (!container) return;
    container.innerHTML = '';

    const regGrid = document.createElement('div');
    regGrid.className = 'register-grid';

    if (this.architecture === 'td4') {
      // TD4 registers
      for (const reg of ['A', 'B', 'PC', 'OUT']) {
        const row = document.createElement('div');
        row.className = 'reg-row';
        row.innerHTML = `
          <span class="reg-name">${reg}</span>
          <span class="reg-hex" id="reg-${reg}-hex">0x0</span>
          <span class="reg-dec" id="reg-${reg}-dec">0</span>
          <span class="reg-bin" id="reg-${reg}-bin">0000</span>
        `;
        regGrid.appendChild(row);
      }
      // Carry flag
      const flagRow = document.createElement('div');
      flagRow.className = 'flag-row';
      flagRow.innerHTML = '<span class="reg-name">FLAGS</span><span class="flag-badge" id="flag-C">C=0</span>';
      regGrid.appendChild(flagRow);
      // Input port display
      const inRow = document.createElement('div');
      inRow.className = 'reg-row';
      inRow.innerHTML = `
        <span class="reg-name">IN</span>
        <span class="reg-hex" id="reg-IN-hex">0x0</span>
        <span class="reg-dec" id="reg-IN-dec">0</span>
        <span class="reg-bin" id="reg-IN-bin">0000</span>
      `;
      regGrid.appendChild(inRow);
    } else {
      // x86 registers
      const regs = ['EAX', 'EBX', 'ECX', 'EDX', 'ESI', 'EDI', 'ESP', 'EBP', 'EIP'];
      const flags = ['ZF', 'CF', 'SF', 'OF'];
      for (const reg of regs) {
        const row = document.createElement('div');
        row.className = 'reg-row';
        row.innerHTML = `
          <span class="reg-name">${reg}</span>
          <span class="reg-hex" id="reg-${reg}-hex">0x00000000</span>
          <span class="reg-dec" id="reg-${reg}-dec">0</span>
        `;
        regGrid.appendChild(row);
      }
      const flagRow = document.createElement('div');
      flagRow.className = 'flag-row';
      flagRow.innerHTML = '<span class="reg-name">FLAGS</span>';
      for (const f of flags) {
        flagRow.innerHTML += `<span class="flag-badge" id="flag-${f}">${f}=0</span>`;
      }
      regGrid.appendChild(flagRow);
    }

    container.appendChild(regGrid);
  }

  _updateRegisterView() {
    if (this.architecture === 'td4') {
      for (const reg of ['A', 'B', 'PC', 'OUT']) {
        const val = this.td4.registers[reg];
        const hexEl = document.getElementById(`reg-${reg}-hex`);
        const decEl = document.getElementById(`reg-${reg}-dec`);
        const binEl = document.getElementById(`reg-${reg}-bin`);
        if (hexEl) {
          const newHex = '0x' + val.toString(16).toUpperCase();
          if (hexEl.textContent !== newHex) {
            hexEl.textContent = newHex;
            hexEl.classList.add('reg-changed');
            setTimeout(() => hexEl.classList.remove('reg-changed'), 400);
          }
        }
        if (decEl) decEl.textContent = val;
        if (binEl) binEl.textContent = val.toString(2).padStart(4, '0');
      }
      // Carry
      const cEl = document.getElementById('flag-C');
      if (cEl) {
        cEl.textContent = `C=${this.td4.carry}`;
        cEl.className = `flag-badge ${this.td4.carry ? 'flag-set' : ''}`;
      }
      // Input
      const inVal = this.td4.inputPort;
      const inHex = document.getElementById('reg-IN-hex');
      const inDec = document.getElementById('reg-IN-dec');
      const inBin = document.getElementById('reg-IN-bin');
      if (inHex) inHex.textContent = '0x' + inVal.toString(16).toUpperCase();
      if (inDec) inDec.textContent = inVal;
      if (inBin) inBin.textContent = inVal.toString(2).padStart(4, '0');
    } else {
      const regs = ['EAX', 'EBX', 'ECX', 'EDX', 'ESI', 'EDI', 'ESP', 'EBP', 'EIP'];
      const flags = ['ZF', 'CF', 'SF', 'OF'];
      for (const reg of regs) {
        const val = this.cpu.getRegisterValue(reg);
        const hexEl = document.getElementById(`reg-${reg}-hex`);
        const decEl = document.getElementById(`reg-${reg}-dec`);
        if (hexEl) {
          const newHex = '0x' + ((val >>> 0).toString(16)).padStart(8, '0').toUpperCase();
          if (hexEl.textContent !== newHex) {
            hexEl.textContent = newHex;
            hexEl.classList.add('reg-changed');
            setTimeout(() => hexEl.classList.remove('reg-changed'), 400);
          }
        }
        if (decEl) decEl.textContent = val;
      }
      for (const f of flags) {
        const el = document.getElementById(`flag-${f}`);
        if (el) {
          const val = this.cpu.flags[f];
          el.textContent = `${f}=${val}`;
          el.className = `flag-badge ${val ? 'flag-set' : ''}`;
        }
      }
    }
  }

  _setupMemoryView() {
    this._updateMemoryView();
  }

  _updateMemoryView() {
    const container = document.getElementById('memory-view');
    if (!container) return;

    if (this.architecture === 'td4') {
      // Show ROM contents for TD4
      let html = '<div class="mem-grid"><div class="mem-header"><span class="mem-addr">Addr</span><span class="mem-col-header">ROM</span><span class="mem-col-header">Opcode</span><span class="mem-col-header">Im</span><span class="mem-col-header" style="flex:2">DIP Switches</span></div>';
      for (let i = 0; i < this.td4.memorySize; i++) {
        const val = this.td4.rom[i];
        const op = (val >> 4) & 0xF;
        const im = val & 0xF;
        const isCurrent = i === this.td4.registers.PC && !this.td4.halted;
        
        // Reverse bits for physical DIP switch layout: Im[reversed] Op[reversed]
        const imStr = im.toString(2).padStart(4, '0').split('').reverse().join('');
        const opStr = op.toString(2).padStart(4, '0').split('').reverse().join('');
        const dipStr = `${imStr} ${opStr}`;

        html += `<div class="mem-row ${isCurrent ? 'mem-current' : ''}">
          <span class="mem-addr">${i.toString(16).toUpperCase()}</span>
          <span class="mem-byte ${val ? 'mem-nonzero' : ''}">${val.toString(16).padStart(2, '0').toUpperCase()}</span>
          <span class="mem-byte">${op.toString(2).padStart(4, '0')}</span>
          <span class="mem-byte">${im.toString(2).padStart(4, '0')}</span>
          <span class="mem-byte" style="flex:2; font-family:monospace">${dipStr}</span>
        </div>`;
      }
      html += '</div>';
      container.innerHTML = html;
    } else {
      // x86 memory view
      const bytesPerRow = 16;
      const rows = Math.min(Math.ceil(this.cpu.memorySize / bytesPerRow), 32);
      let html = '<div class="mem-grid">';
      html += '<div class="mem-header"><span class="mem-addr">Addr</span>';
      for (let i = 0; i < bytesPerRow; i++) {
        html += `<span class="mem-col-header">${i.toString(16).toUpperCase()}</span>`;
      }
      html += '</div>';
      for (let row = 0; row < rows; row++) {
        const addr = row * bytesPerRow;
        html += `<div class="mem-row"><span class="mem-addr">0x${addr.toString(16).padStart(4, '0')}</span>`;
        for (let col = 0; col < bytesPerRow; col++) {
          const a = addr + col;
          if (a < this.cpu.memorySize) {
            const val = this.cpu.memory[a];
            const isNonZero = val !== 0;
            html += `<span class="mem-byte ${isNonZero ? 'mem-nonzero' : ''}" title="0x${a.toString(16)}: ${val}">${val.toString(16).padStart(2, '0').toUpperCase()}</span>`;
          } else {
            html += `<span class="mem-byte mem-out">--</span>`;
          }
        }
        html += '</div>';
      }
      html += '</div>';
      container.innerHTML = html;
    }
  }

  _setupArchitectureInfo() {
    this._updateArchInfo();
  }

  _updateArchInfo() {
    const info = ARCH_INFO[this.architecture];
    const modal = document.getElementById('arch-info-content');
    if (modal) {
      modal.innerHTML = info.history;
    }
    const label = document.getElementById('arch-info-label');
    if (label) label.textContent = info.shortDesc;
  }

  _setupDocumentation() {
    const container = document.getElementById('docs-content');
    if (!container) return;

    if (this.architecture === 'td4') {
      this._setupTD4Documentation(container);
      return;
    }

    const instrDocs = [
      { cat: 'Data Movement', instrs: [
        { name: 'MOV dst, src', desc: 'Copy value from src to dst', flags: 'None', ex: 'MOV EAX, 42' },
        { name: 'PUSH src', desc: 'Push value onto the stack (ESP decreases by 4)', flags: 'None', ex: 'PUSH EAX' },
        { name: 'POP dst', desc: 'Pop value from stack into dst (ESP increases by 4)', flags: 'None', ex: 'POP EBX' },
        { name: 'LEA dst, [addr]', desc: 'Load effective address', flags: 'None', ex: 'LEA EAX, [EBX+4]' },
      ]},
      { cat: 'Arithmetic', instrs: [
        { name: 'ADD dst, src', desc: 'Add: dst = dst + src', flags: 'ZF, SF, CF, OF', ex: 'ADD EAX, EBX' },
        { name: 'SUB dst, src', desc: 'Subtract: dst = dst - src', flags: 'ZF, SF, CF, OF', ex: 'SUB EAX, 5' },
        { name: 'MUL src', desc: 'Unsigned multiply: EAX = EAX × src', flags: 'CF, OF', ex: 'MUL EBX' },
        { name: 'DIV src', desc: 'Unsigned divide: EAX = EAX ÷ src', flags: 'None', ex: 'DIV ECX' },
        { name: 'INC dst', desc: 'Increment: dst + 1', flags: 'ZF, SF, OF', ex: 'INC ECX' },
        { name: 'DEC dst', desc: 'Decrement: dst - 1', flags: 'ZF, SF, OF', ex: 'DEC ECX' },
        { name: 'NEG dst', desc: 'Negate (two\'s complement)', flags: 'All', ex: 'NEG EAX' },
      ]},
      { cat: 'Logic / Bitwise', instrs: [
        { name: 'AND dst, src', desc: 'Bitwise AND', flags: 'ZF, SF', ex: 'AND EAX, 0xFF' },
        { name: 'OR dst, src', desc: 'Bitwise OR', flags: 'ZF, SF', ex: 'OR EAX, EBX' },
        { name: 'XOR dst, src', desc: 'Bitwise XOR', flags: 'ZF, SF', ex: 'XOR EAX, EAX' },
        { name: 'NOT dst', desc: 'Bitwise NOT', flags: 'None', ex: 'NOT EBX' },
        { name: 'SHL dst, n', desc: 'Shift left', flags: 'ZF, SF, CF', ex: 'SHL EAX, 1' },
        { name: 'SHR dst, n', desc: 'Shift right', flags: 'ZF, SF, CF', ex: 'SHR EAX, 2' },
      ]},
      { cat: 'Comparison / Control Flow', instrs: [
        { name: 'CMP a, b', desc: 'Compare (sets flags)', flags: 'All', ex: 'CMP EAX, 0' },
        { name: 'JMP label', desc: 'Unconditional jump', flags: 'None', ex: 'JMP loop' },
        { name: 'JE / JZ', desc: 'Jump if equal/zero', flags: 'None', ex: 'JE done' },
        { name: 'JNE / JNZ', desc: 'Jump if not equal', flags: 'None', ex: 'JNE loop' },
        { name: 'JG / JL / JGE / JLE', desc: 'Signed comparison jumps', flags: 'None', ex: 'JG positive' },
        { name: 'CALL label', desc: 'Function call (pushes return addr)', flags: 'None', ex: 'CALL func' },
        { name: 'RET', desc: 'Return from function', flags: 'None', ex: 'RET' },
      ]},
      { cat: 'System / IO', instrs: [
        { name: 'NOP', desc: 'No operation', flags: 'None', ex: 'NOP' },
        { name: 'HLT', desc: 'Halt CPU', flags: 'None', ex: 'HLT' },
        { name: 'INT 0x10', desc: 'Print AL as ASCII to text monitor', flags: 'None', ex: 'INT 0x10' },
        { name: 'INT 0x20', desc: 'Output AL to 8 LEDs', flags: 'None', ex: 'INT 0x20' },
        { name: 'INT 0x21', desc: 'Read char from console into AL', flags: 'None', ex: 'INT 0x21' },
        { name: 'INT 0x22', desc: 'Display AL on 7-segment (0-F)', flags: 'None', ex: 'INT 0x22' },
        { name: 'INT 0x30', desc: 'Set pixel: AL=color, AH=X, BL=Y', flags: 'None', ex: 'INT 0x30' },
        { name: 'INT 0x31', desc: 'Fill video with color in AL', flags: 'None', ex: 'INT 0x31' },
      ]},
    ];

    let html = '<div class="docs-list">';
    html += `<div class="doc-section">
      <h4>📖 Quick Reference — x86</h4>
      <div class="doc-note">
        <strong>Syntax:</strong> Intel syntax (destination first)<br>
        <strong>Numbers:</strong> Decimal (42), Hex (0x2A), Binary (0b101010)<br>
        <strong>Memory:</strong> [address] e.g. [0x80], [ESI+4]<br>
        <strong>Labels:</strong> <code>my_label:</code><br>
        <strong>Comments:</strong> <code>; comment</code>
      </div>
    </div>`;
    for (const cat of instrDocs) {
      html += `<div class="doc-section"><h4>${cat.cat}</h4>`;
      for (const instr of cat.instrs) {
        html += `<div class="doc-instr">
          <div class="doc-instr-name">${instr.name}</div>
          <div class="doc-instr-desc">${instr.desc}</div>
          <div class="doc-instr-meta"><span class="doc-flags">Flags: ${instr.flags}</span><code class="doc-example">${instr.ex}</code></div>
        </div>`;
      }
      html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
  }

  _setupTD4Documentation(container) {
    const instrDocs = [
      { name: 'ADD A, Im', desc: 'A = A + Im (4-bit, carry flag set)', opcode: '0000', ex: 'ADD A, 3' },
      { name: 'MOV A, B', desc: 'Copy B into A', opcode: '0001', ex: 'MOV A, B' },
      { name: 'IN A', desc: 'Read 4-bit input port into A', opcode: '0010', ex: 'IN A' },
      { name: 'MOV A, Im', desc: 'Load immediate value into A', opcode: '0011', ex: 'MOV A, 5' },
      { name: 'MOV B, A', desc: 'Copy A into B', opcode: '0100', ex: 'MOV B, A' },
      { name: 'ADD B, Im', desc: 'B = B + Im (4-bit, carry flag set)', opcode: '0101', ex: 'ADD B, 1' },
      { name: 'IN B', desc: 'Read 4-bit input port into B', opcode: '0110', ex: 'IN B' },
      { name: 'MOV B, Im', desc: 'Load immediate value into B', opcode: '0111', ex: 'MOV B, 7' },
      { name: 'OUT B', desc: 'Output B to the 4-bit output port (LEDs)', opcode: '1001', ex: 'OUT B' },
      { name: 'OUT Im', desc: 'Output immediate value to output port', opcode: '1011', ex: 'OUT 0b1010' },
      { name: 'JZ Im', desc: 'Jump to address Im if Carry=0', opcode: '1110', ex: 'JZ loop' },
      { name: 'JMP Im', desc: 'Unconditional jump to address Im', opcode: '1111', ex: 'JMP 0' },
    ];

    let html = '<div class="docs-list">';
    html += `<div class="doc-section">
      <h4>📖 TD4 Quick Reference</h4>
      <div class="doc-note">
        <strong>Registers:</strong> A, B (4-bit each)<br>
        <strong>Address space:</strong> 16 bytes (4-bit PC)<br>
        <strong>ALU:</strong> 4-bit adder only (74HC283)<br>
        <strong>Flags:</strong> Carry (C) only<br>
        <strong>Numbers:</strong> 0-15 (decimal) or 0b0000-0b1111 (binary)<br>
        <strong>Comments:</strong> <code>; comment</code><br>
        <strong>IO:</strong> OUT = 4 LEDs, IN = 4 DIP switches
      </div>
    </div>`;
    html += '<div class="doc-section"><h4>Instructions (8-bit encoding: opcode[7:4] + Im[3:0])</h4>';
    for (const instr of instrDocs) {
      html += `<div class="doc-instr">
        <div class="doc-instr-name">${instr.name}</div>
        <div class="doc-instr-desc">${instr.desc}</div>
        <div class="doc-instr-meta"><span class="doc-flags">Opcode: ${instr.opcode}</span><code class="doc-example">${instr.ex}</code></div>
      </div>`;
    }
    html += '</div>';

    html += `<div class="doc-section"><h4>ICs Used (MuseLab v1.3)</h4>
      <div class="doc-note">
        <strong>U1:</strong> 74HC74 — D flip-flop (clock/carry)<br>
        <strong>U2:</strong> 74HC14 — Schmitt inverters (clock)<br>
        <strong>U3-U6:</strong> 74HC161 ×4 — Counters (A, B, PC, OUT)<br>
        <strong>U7-U8:</strong> 74HC153 ×2 — Multiplexers (ALU input)<br>
        <strong>U9:</strong> 74HC283 — 4-bit adder (ALU)<br>
        <strong>U10:</strong> 74HC32 — OR gates (control)<br>
        <strong>U11:</strong> 74HC10 — NAND gates (control)<br>
        <strong>U12:</strong> 74HC540 — Buffer (output)<br>
        <strong>U13:</strong> 74HC154 — Decoder (ROM address)
      </div>
    </div>`;
    html += '</div>';
    container.innerHTML = html;
  }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
