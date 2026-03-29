// cpu-td4.js — TD4 CPU State Machine
// 4-bit CPU designed by Kaoru Tonami (CPU no Tsukurikata)
// Based on MuseLab/wuxx's hardware implementation
// 
// Architecture:
// - 2 registers: A, B (4-bit each)
// - 4-bit Program Counter (PC) → 16-byte address space
// - No stack, no interrupts
// - ALU: 4-bit adder only (74HC283)
// - Carry flag (C)
// - 4-bit output port
// - 4-bit input port
// - 16-byte diode-matrix ROM
//
// ICs used: 74HC74, 74HC14, 74HC161 ×4, 74HC153 ×2, 
//           74HC283, 74HC32, 74HC10, 74HC540, 74HC154

export class TD4CPU {
  constructor(memorySize = 32) {
    this.memorySize = memorySize;
    this.reset();
    this.ioHandlers = { output: null, input: null };
    this.onStateChange = null;
    this.breakpoints = new Set();
    this.halted = false;
    this.instructions = []; // Parsed instruction objects
    this.rom = new Uint8Array(this.memorySize); // Configurable ROM size
    this.cycleInfo = null;
  }

  reset() {
    this.registers = {
      A: 0,    // 4-bit register A (74HC161 U3)
      B: 0,    // 4-bit register B (74HC161 U4)
      PC: 0,   // 4-bit program counter (74HC161 U5)
      OUT: 0,  // 4-bit output register (74HC161 U6)
    };
    this.carry = 0; // Carry flag (from 74HC283 adder, stored in 74HC74)
    this.inputPort = 0; // 4-bit input (from DIP switches)
    this.rom = new Uint8Array(this.memorySize);
    this.halted = false;
    this.cycleInfo = null;
  }

  loadProgram(instructions) {
    this.reset();
    this.instructions = instructions;
    // Load into ROM
    for (let i = 0; i < instructions.length && i < this.memorySize; i++) {
      this.rom[i] = instructions[i].opcode;
    }
  }

  setInput(value) {
    this.inputPort = value & 0xF;
  }

  // Execute one instruction
  step() {
    if (this.halted) return null;
    if (this.registers.PC >= this.memorySize || this.registers.PC >= this.instructions.length) {
      this.halted = true;
      return null;
    }

    const pc = this.registers.PC;
    const instr = this.instructions[pc];
    const romByte = this.rom[pc];
    const opcode = (romByte >> 4) & 0xF;
    const im = romByte & 0xF;

    const cycle = {
      phase: 'fetch',
      instruction: instr,
      instructionIndex: pc,
      sourceLine: instr.line,
      phases: [],
      dataFlow: [],
      registersModified: [],
      memoryAccessed: [{ type: 'read', address: pc }],
      busActivity: { data: romByte, address: pc, control: null },
      // TD4-specific: control signals
      controlSignals: {
        SEL_A: 0, SEL_B: 0,
        LOAD0: 1, LOAD1: 1, LOAD2: 1, LOAD3: 1, // Active low
      },
    };

    cycle.phases.push({ 
      name: 'fetch', 
      description: `Fetch ROM[${pc}] = 0x${romByte.toString(16).padStart(2, '0')} (${instr.raw})`,
      component: 'rom'
    });

    // Decode: extract opcode and immediate
    cycle.phases.push({ 
      name: 'decode', 
      description: `Decode: opcode=0b${opcode.toString(2).padStart(4, '0')}, Im=${im}`,
      component: 'decoder'
    });

    // Execute based on opcode
    let nextPC = pc + 1;
    const op = instr.mnemonic.toUpperCase();

    switch (opcode) {
      case 0b0000: { // ADD A, Im
        const result = this.registers.A + im;
        this.registers.A = result & 0xF;
        this.carry = (result > 0xF) ? 1 : 0;
        cycle.controlSignals = { SEL_A: 0, SEL_B: 0, LOAD0: 0, LOAD1: 1, LOAD2: 1, LOAD3: 1 };
        cycle.phases.push({ 
          name: 'execute', 
          description: `ALU: A(${this.registers.A}) = A + ${im}, Carry=${this.carry}`,
          component: 'alu', operation: 'add'
        });
        cycle.registersModified.push('A');
        cycle.dataFlow.push({ from: {type: 'register', value: 'A'}, to: {type: 'component', value: 'ALU'}, value: this.registers.A });
        break;
      }
      case 0b0001: { // MOV A, B
        this.registers.A = this.registers.B;
        this.carry = 0;
        cycle.controlSignals = { SEL_A: 1, SEL_B: 0, LOAD0: 0, LOAD1: 1, LOAD2: 1, LOAD3: 1 };
        cycle.phases.push({ 
          name: 'execute', 
          description: `MOV: A = B (${this.registers.B})`,
          component: 'register'
        });
        cycle.registersModified.push('A');
        cycle.dataFlow.push({ from: {type: 'register', value: 'B'}, to: {type: 'register', value: 'A'}, value: this.registers.B });
        break;
      }
      case 0b0010: { // IN A
        this.registers.A = this.inputPort & 0xF;
        this.carry = 0;
        cycle.controlSignals = { SEL_A: 0, SEL_B: 1, LOAD0: 0, LOAD1: 1, LOAD2: 1, LOAD3: 1 };
        cycle.phases.push({ 
          name: 'execute', 
          description: `IN: A = Input Port (${this.inputPort})`,
          component: 'io'
        });
        cycle.registersModified.push('A');
        break;
      }
      case 0b0011: { // MOV A, Im
        this.registers.A = im;
        this.carry = 0;
        cycle.controlSignals = { SEL_A: 1, SEL_B: 1, LOAD0: 0, LOAD1: 1, LOAD2: 1, LOAD3: 1 };
        cycle.phases.push({ 
          name: 'execute', 
          description: `MOV: A = ${im} (0b${im.toString(2).padStart(4, '0')})`,
          component: 'register'
        });
        cycle.registersModified.push('A');
        break;
      }
      case 0b0100: { // MOV B, A
        this.registers.B = this.registers.A;
        this.carry = 0;
        cycle.controlSignals = { SEL_A: 0, SEL_B: 0, LOAD0: 1, LOAD1: 0, LOAD2: 1, LOAD3: 1 };
        cycle.phases.push({ 
          name: 'execute', 
          description: `MOV: B = A (${this.registers.A})`,
          component: 'register'
        });
        cycle.registersModified.push('B');
        cycle.dataFlow.push({ from: {type: 'register', value: 'A'}, to: {type: 'register', value: 'B'}, value: this.registers.A });
        break;
      }
      case 0b0101: { // ADD B, Im
        const result = this.registers.B + im;
        this.registers.B = result & 0xF;
        this.carry = (result > 0xF) ? 1 : 0;
        cycle.controlSignals = { SEL_A: 1, SEL_B: 0, LOAD0: 1, LOAD1: 0, LOAD2: 1, LOAD3: 1 };
        cycle.phases.push({ 
          name: 'execute', 
          description: `ALU: B(${this.registers.B}) = B + ${im}, Carry=${this.carry}`,
          component: 'alu', operation: 'add'
        });
        cycle.registersModified.push('B');
        break;
      }
      case 0b0110: { // IN B
        this.registers.B = this.inputPort & 0xF;
        this.carry = 0;
        cycle.controlSignals = { SEL_A: 0, SEL_B: 1, LOAD0: 1, LOAD1: 0, LOAD2: 1, LOAD3: 1 };
        cycle.phases.push({ 
          name: 'execute', 
          description: `IN: B = Input Port (${this.inputPort})`,
          component: 'io'
        });
        cycle.registersModified.push('B');
        break;
      }
      case 0b0111: { // MOV B, Im
        this.registers.B = im;
        this.carry = 0;
        cycle.controlSignals = { SEL_A: 1, SEL_B: 1, LOAD0: 1, LOAD1: 0, LOAD2: 1, LOAD3: 1 };
        cycle.phases.push({ 
          name: 'execute', 
          description: `MOV: B = ${im} (0b${im.toString(2).padStart(4, '0')})`,
          component: 'register'
        });
        cycle.registersModified.push('B');
        break;
      }
      case 0b1001: { // OUT B
        this.registers.OUT = this.registers.B;
        cycle.controlSignals = { SEL_A: 0, SEL_B: 1, LOAD0: 1, LOAD1: 1, LOAD2: 0, LOAD3: 1 };
        cycle.phases.push({ 
          name: 'execute', 
          description: `OUT: Output Port = B (${this.registers.B} = 0b${this.registers.B.toString(2).padStart(4, '0')})`,
          component: 'io'
        });
        cycle.registersModified.push('OUT');
        if (this.ioHandlers.output) this.ioHandlers.output(this.registers.OUT);
        break;
      }
      case 0b1011: { // OUT Im
        this.registers.OUT = im;
        cycle.controlSignals = { SEL_A: 1, SEL_B: 1, LOAD0: 1, LOAD1: 1, LOAD2: 0, LOAD3: 1 };
        cycle.phases.push({ 
          name: 'execute', 
          description: `OUT: Output Port = ${im} (0b${im.toString(2).padStart(4, '0')})`,
          component: 'io'
        });
        cycle.registersModified.push('OUT');
        if (this.ioHandlers.output) this.ioHandlers.output(im);
        break;
      }
      case 0b1110: { // JZ Im (jump if carry = 0)
        if (this.carry === 0) {
          nextPC = im;
          cycle.phases.push({ 
            name: 'execute', 
            description: `JZ: Carry=0 → JUMP to address ${im}`,
            component: 'control'
          });
        } else {
          cycle.phases.push({ 
            name: 'execute', 
            description: `JZ: Carry=1 → no jump (continue to ${pc + 1})`,
            component: 'control'
          });
        }
        cycle.controlSignals = { SEL_A: 1, SEL_B: 1, LOAD0: 1, LOAD1: 1, LOAD2: 1, LOAD3: 0 };
        break;
      }
      case 0b1111: { // JMP Im
        nextPC = im;
        cycle.controlSignals = { SEL_A: 1, SEL_B: 1, LOAD0: 1, LOAD1: 1, LOAD2: 1, LOAD3: 0 };
        cycle.phases.push({ 
          name: 'execute', 
          description: `JMP: Jump to address ${im}`,
          component: 'control'
        });
        break;
      }
      default: {
        // Unused opcodes (0b1000, 0b1010, 0b1100, 0b1101) = NOP
        cycle.phases.push({ 
          name: 'execute', 
          description: `NOP (unused opcode 0b${opcode.toString(2).padStart(4, '0')})` 
        });
        break;
      }
    }

    // Update PC
    this.registers.PC = nextPC & (this.memorySize - 1);
    cycle.registersModified.push('PC');

    // Writeback
    cycle.phases.push({ 
      name: 'writeback', 
      description: `PC → ${this.registers.PC}. Modified: ${cycle.registersModified.join(', ')}` 
    });

    // Check if we've reached the end
    if (this.registers.PC >= this.instructions.length) {
      this.halted = true;
    }

    this.cycleInfo = cycle;
    if (this.onStateChange) this.onStateChange(cycle);
    return cycle;
  }

  getRegisterValue(name) {
    name = name.toUpperCase();
    if (name === 'A') return this.registers.A;
    if (name === 'B') return this.registers.B;
    if (name === 'PC') return this.registers.PC;
    if (name === 'OUT') return this.registers.OUT;
    if (name === 'AL') return this.registers.A; // compatibility alias
    return 0;
  }

  getState() {
    return {
      registers: { ...this.registers },
      carry: this.carry,
      inputPort: this.inputPort,
      rom: new Uint8Array(this.rom),
      halted: this.halted,
    };
  }
}
