// cpu.js — CPU State Machine for x86-inspired visualizer
// Manages registers, flags, memory, and instruction execution

export class CPU {
  constructor(memorySize = 256, isROM = true) {
    this.memorySize = memorySize;
    this.isROM = isROM;
    this.reset();
    this.ioHandlers = {};
    this.onStateChange = null;
    this.onMemoryAccess = null;
    this.breakpoints = new Set();
    this.halted = false;
    this.instructions = [];
    this.labelMap = {};
    this.cycleInfo = null; // Info about current cycle for visualizer
  }

  reset() {
    // 32-bit general purpose registers
    this.registers = {
      EAX: 0, EBX: 0, ECX: 0, EDX: 0,
      ESI: 0, EDI: 0,
      ESP: this.memorySize - 4, // Stack pointer starts at top
      EBP: this.memorySize - 4, // Base pointer
      EIP: 0,                    // Instruction pointer (index into instructions array)
    };
    // EFLAGS: ZF (zero), CF (carry), SF (sign), OF (overflow)
    this.flags = { ZF: 0, CF: 0, SF: 0, OF: 0 };
    // Memory
    this.memory = new Uint8Array(this.memorySize);
    this.romImage = null; // Snapshot for ROM mode
    this.halted = false;
    this.cycleInfo = null;
  }

  setMemorySize(size) {
    this.memorySize = size;
    this.reset();
  }

  setROMMode(isROM) {
    this.isROM = isROM;
  }

  loadProgram(instructions, labelMap) {
    this.reset();
    this.instructions = instructions;
    this.labelMap = labelMap;
    // Pre-store any memory initialization instructions
    // Take a ROM snapshot after initial memory writes if in ROM mode
    if (this.isROM) {
      this.romImage = new Uint8Array(this.memory);
    }
  }

  registerIO(intNumber, handler) {
    this.ioHandlers[intNumber] = handler;
  }

  getRegisterValue(name) {
    name = name.toUpperCase();
    // Handle 8-bit sub-registers
    if (name === 'AL') return this.registers.EAX & 0xFF;
    if (name === 'AH') return (this.registers.EAX >> 8) & 0xFF;
    if (name === 'BL') return this.registers.EBX & 0xFF;
    if (name === 'BH') return (this.registers.EBX >> 8) & 0xFF;
    if (name === 'CL') return this.registers.ECX & 0xFF;
    if (name === 'CH') return (this.registers.ECX >> 8) & 0xFF;
    if (name === 'DL') return this.registers.EDX & 0xFF;
    if (name === 'DH') return (this.registers.EDX >> 8) & 0xFF;
    // 16-bit
    if (name === 'AX') return this.registers.EAX & 0xFFFF;
    if (name === 'BX') return this.registers.EBX & 0xFFFF;
    if (name === 'CX') return this.registers.ECX & 0xFFFF;
    if (name === 'DX') return this.registers.EDX & 0xFFFF;
    if (name === 'SI') return this.registers.ESI & 0xFFFF;
    if (name === 'DI') return this.registers.EDI & 0xFFFF;
    if (name === 'SP') return this.registers.ESP & 0xFFFF;
    if (name === 'BP') return this.registers.EBP & 0xFFFF;
    return this.registers[name] !== undefined ? this.registers[name] : 0;
  }

  setRegisterValue(name, value) {
    name = name.toUpperCase();
    value = value & 0xFFFFFFFF; // Clamp to 32-bit
    if (value > 0x7FFFFFFF) value = value - 0x100000000; // Sign extend for JS

    // Handle 8-bit sub-registers
    if (name === 'AL') { this.registers.EAX = (this.registers.EAX & 0xFFFFFF00) | (value & 0xFF); return; }
    if (name === 'AH') { this.registers.EAX = (this.registers.EAX & 0xFFFF00FF) | ((value & 0xFF) << 8); return; }
    if (name === 'BL') { this.registers.EBX = (this.registers.EBX & 0xFFFFFF00) | (value & 0xFF); return; }
    if (name === 'BH') { this.registers.EBX = (this.registers.EBX & 0xFFFF00FF) | ((value & 0xFF) << 8); return; }
    if (name === 'CL') { this.registers.ECX = (this.registers.ECX & 0xFFFFFF00) | (value & 0xFF); return; }
    if (name === 'CH') { this.registers.ECX = (this.registers.ECX & 0xFFFF00FF) | ((value & 0xFF) << 8); return; }
    if (name === 'DL') { this.registers.EDX = (this.registers.EDX & 0xFFFFFF00) | (value & 0xFF); return; }
    if (name === 'DH') { this.registers.EDX = (this.registers.EDX & 0xFFFF00FF) | ((value & 0xFF) << 8); return; }
    // 16-bit
    if (name === 'AX') { this.registers.EAX = (this.registers.EAX & 0xFFFF0000) | (value & 0xFFFF); return; }
    if (name === 'BX') { this.registers.EBX = (this.registers.EBX & 0xFFFF0000) | (value & 0xFFFF); return; }
    if (name === 'CX') { this.registers.ECX = (this.registers.ECX & 0xFFFF0000) | (value & 0xFFFF); return; }
    if (name === 'DX') { this.registers.EDX = (this.registers.EDX & 0xFFFF0000) | (value & 0xFFFF); return; }
    if (name === 'SI') { this.registers.ESI = (this.registers.ESI & 0xFFFF0000) | (value & 0xFFFF); return; }
    if (name === 'DI') { this.registers.EDI = (this.registers.EDI & 0xFFFF0000) | (value & 0xFFFF); return; }
    if (name === 'SP') { this.registers.ESP = (this.registers.ESP & 0xFFFF0000) | (value & 0xFFFF); return; }
    if (name === 'BP') { this.registers.EBP = (this.registers.EBP & 0xFFFF0000) | (value & 0xFFFF); return; }
    if (this.registers[name] !== undefined) {
      this.registers[name] = value;
    }
  }

  readMemory(address) {
    address = address & 0xFFFF;
    if (address < 0 || address >= this.memorySize) return 0;
    if (this.onMemoryAccess) this.onMemoryAccess('read', address, this.memory[address]);
    return this.memory[address];
  }

  writeMemory(address, value) {
    address = address & 0xFFFF;
    if (address < 0 || address >= this.memorySize) return;
    if (this.isROM && this.romImage) {
      // ROM mode: only allow writes to non-ROM areas (stack region)
      // Allow writes to upper quarter for stack
      if (address < Math.floor(this.memorySize * 0.75)) {
        console.warn(`ROM: Write blocked at 0x${address.toString(16)}`);
        return;
      }
    }
    this.memory[address] = value & 0xFF;
    if (this.onMemoryAccess) this.onMemoryAccess('write', address, value & 0xFF);
  }

  pushStack(value) {
    this.registers.ESP -= 4;
    const addr = this.registers.ESP;
    // Write 32-bit value in little-endian
    this.writeMemory(addr, value & 0xFF);
    this.writeMemory(addr + 1, (value >> 8) & 0xFF);
    this.writeMemory(addr + 2, (value >> 16) & 0xFF);
    this.writeMemory(addr + 3, (value >> 24) & 0xFF);
  }

  popStack() {
    const addr = this.registers.ESP;
    const value = this.readMemory(addr) |
                  (this.readMemory(addr + 1) << 8) |
                  (this.readMemory(addr + 2) << 16) |
                  (this.readMemory(addr + 3) << 24);
    this.registers.ESP += 4;
    return value;
  }

  updateFlags(result, operandSize = 32) {
    const mask = operandSize === 8 ? 0xFF : operandSize === 16 ? 0xFFFF : 0xFFFFFFFF;
    const signBit = operandSize === 8 ? 0x80 : operandSize === 16 ? 0x8000 : 0x80000000;
    const maskedResult = result & mask;
    this.flags.ZF = maskedResult === 0 ? 1 : 0;
    this.flags.SF = (maskedResult & signBit) ? 1 : 0;
    this.flags.CF = (result > mask || result < 0) ? 1 : 0;
    this.flags.OF = 0; // Simplified
  }

  resolveOperand(operand) {
    if (!operand) return { value: 0, type: 'none' };
    if (operand.type === 'register') {
      return { value: this.getRegisterValue(operand.value), type: 'register', name: operand.value };
    } else if (operand.type === 'immediate') {
      return { value: operand.value, type: 'immediate' };
    } else if (operand.type === 'memory') {
      let address = 0;
      if (operand.base) address += this.getRegisterValue(operand.base);
      if (operand.offset !== undefined) address += operand.offset;
      if (operand.index) address += this.getRegisterValue(operand.index);
      const val = this.readMemory(address);
      return { value: val, type: 'memory', address: address };
    } else if (operand.type === 'label') {
      const target = this.labelMap[operand.value];
      return { value: target !== undefined ? target : 0, type: 'label', name: operand.value };
    }
    return { value: 0, type: 'none' };
  }

  writeOperand(operand, value) {
    if (operand.type === 'register') {
      this.setRegisterValue(operand.value, value);
    } else if (operand.type === 'memory') {
      let address = 0;
      if (operand.base) address += this.getRegisterValue(operand.base);
      if (operand.offset !== undefined) address += operand.offset;
      if (operand.index) address += this.getRegisterValue(operand.index);
      this.writeMemory(address, value & 0xFF);
    }
  }

  // Execute one instruction. Returns cycle info for visualizer.
  step() {
    if (this.halted) return null;
    const eip = this.registers.EIP;
    if (eip < 0 || eip >= this.instructions.length) {
      this.halted = true;
      return null;
    }

    const instr = this.instructions[eip];
    const cycle = {
      phase: 'fetch',
      instruction: instr,
      instructionIndex: eip,
      sourceLine: instr.line,
      phases: [],
      dataFlow: [],
      registersModified: [],
      memoryAccessed: [],
      busActivity: { data: null, address: null, control: null },
    };

    // FETCH phase
    cycle.phases.push({ name: 'fetch', description: `Fetching instruction at index ${eip}: ${instr.raw}` });

    // DECODE phase
    cycle.phases.push({ name: 'decode', description: `Decoding: ${instr.mnemonic} ${instr.operandsRaw || ''}` });

    // EXECUTE phase
    this.registers.EIP++;
    const op = instr.mnemonic.toUpperCase();
    const dst = instr.operands[0];
    const src = instr.operands[1];

    try {
      switch (op) {
        case 'MOV': {
          const srcVal = this.resolveOperand(src);
          this.writeOperand(dst, srcVal.value);
          cycle.phases.push({ name: 'execute', description: `Moving value ${srcVal.value} (0x${(srcVal.value & 0xFF).toString(16)})` });
          cycle.dataFlow.push({ from: src, to: dst, value: srcVal.value });
          if (dst.type === 'register') cycle.registersModified.push(dst.value);
          if (dst.type === 'memory' || src.type === 'memory') {
            const addr = dst.type === 'memory' ? this._resolveAddress(dst) : this._resolveAddress(src);
            cycle.memoryAccessed.push({ type: dst.type === 'memory' ? 'write' : 'read', address: addr });
            cycle.busActivity.address = addr;
          }
          cycle.busActivity.data = srcVal.value;
          break;
        }
        case 'ADD': {
          const dstVal = this.resolveOperand(dst);
          const srcVal = this.resolveOperand(src);
          const result = dstVal.value + srcVal.value;
          this.writeOperand(dst, result);
          this.updateFlags(result);
          cycle.phases.push({ name: 'execute', description: `ALU: ${dstVal.value} + ${srcVal.value} = ${result & 0xFFFFFFFF}`, component: 'alu', operation: 'add' });
          cycle.dataFlow.push({ from: src, to: { type: 'component', value: 'ALU' }, value: srcVal.value });
          cycle.dataFlow.push({ from: dst, to: { type: 'component', value: 'ALU' }, value: dstVal.value });
          cycle.dataFlow.push({ from: { type: 'component', value: 'ALU' }, to: dst, value: result });
          if (dst.type === 'register') cycle.registersModified.push(dst.value);
          cycle.busActivity.data = result;
          break;
        }
        case 'SUB': {
          const dstVal = this.resolveOperand(dst);
          const srcVal = this.resolveOperand(src);
          const result = dstVal.value - srcVal.value;
          this.writeOperand(dst, result);
          this.updateFlags(result);
          cycle.phases.push({ name: 'execute', description: `ALU: ${dstVal.value} - ${srcVal.value} = ${result}`, component: 'alu', operation: 'sub' });
          cycle.dataFlow.push({ from: { type: 'component', value: 'ALU' }, to: dst, value: result });
          if (dst.type === 'register') cycle.registersModified.push(dst.value);
          break;
        }
        case 'MUL': {
          const srcVal = this.resolveOperand(dst); // MUL src — multiplies EAX by src
          const eaxVal = this.registers.EAX;
          const result = eaxVal * srcVal.value;
          this.registers.EAX = result & 0xFFFFFFFF;
          this.registers.EDX = Math.floor(result / 0x100000000) & 0xFFFFFFFF;
          this.updateFlags(result);
          cycle.phases.push({ name: 'execute', description: `ALU: EAX(${eaxVal}) × ${srcVal.value} = ${result}`, component: 'alu', operation: 'mul' });
          cycle.registersModified.push('EAX', 'EDX');
          break;
        }
        case 'DIV': {
          const srcVal = this.resolveOperand(dst); // DIV src — divides EAX by src
          if (srcVal.value === 0) { this.halted = true; cycle.phases.push({ name: 'execute', description: 'Division by zero! CPU halted.' }); break; }
          const eaxVal = this.registers.EAX;
          this.registers.EAX = Math.floor(eaxVal / srcVal.value) & 0xFFFFFFFF;
          this.registers.EDX = (eaxVal % srcVal.value) & 0xFFFFFFFF;
          cycle.phases.push({ name: 'execute', description: `ALU: EAX(${eaxVal}) ÷ ${srcVal.value} = ${this.registers.EAX} R ${this.registers.EDX}`, component: 'alu', operation: 'div' });
          cycle.registersModified.push('EAX', 'EDX');
          break;
        }
        case 'INC': {
          const val = this.resolveOperand(dst);
          const result = val.value + 1;
          this.writeOperand(dst, result);
          this.updateFlags(result);
          cycle.phases.push({ name: 'execute', description: `ALU: ${val.value} + 1 = ${result}`, component: 'alu', operation: 'add' });
          if (dst.type === 'register') cycle.registersModified.push(dst.value);
          break;
        }
        case 'DEC': {
          const val = this.resolveOperand(dst);
          const result = val.value - 1;
          this.writeOperand(dst, result);
          this.updateFlags(result);
          cycle.phases.push({ name: 'execute', description: `ALU: ${val.value} - 1 = ${result}`, component: 'alu', operation: 'sub' });
          if (dst.type === 'register') cycle.registersModified.push(dst.value);
          break;
        }
        case 'NEG': {
          const val = this.resolveOperand(dst);
          const result = -val.value;
          this.writeOperand(dst, result);
          this.updateFlags(result);
          cycle.phases.push({ name: 'execute', description: `ALU: NEG ${val.value} = ${result}`, component: 'alu', operation: 'neg' });
          if (dst.type === 'register') cycle.registersModified.push(dst.value);
          break;
        }
        case 'AND': {
          const dstVal = this.resolveOperand(dst);
          const srcVal = this.resolveOperand(src);
          const result = dstVal.value & srcVal.value;
          this.writeOperand(dst, result);
          this.updateFlags(result);
          cycle.phases.push({ name: 'execute', description: `ALU: 0x${dstVal.value.toString(16)} AND 0x${srcVal.value.toString(16)} = 0x${result.toString(16)}`, component: 'alu', operation: 'and' });
          if (dst.type === 'register') cycle.registersModified.push(dst.value);
          break;
        }
        case 'OR': {
          const dstVal = this.resolveOperand(dst);
          const srcVal = this.resolveOperand(src);
          const result = dstVal.value | srcVal.value;
          this.writeOperand(dst, result);
          this.updateFlags(result);
          cycle.phases.push({ name: 'execute', description: `ALU: 0x${dstVal.value.toString(16)} OR 0x${srcVal.value.toString(16)} = 0x${result.toString(16)}`, component: 'alu', operation: 'or' });
          if (dst.type === 'register') cycle.registersModified.push(dst.value);
          break;
        }
        case 'XOR': {
          const dstVal = this.resolveOperand(dst);
          const srcVal = this.resolveOperand(src);
          const result = dstVal.value ^ srcVal.value;
          this.writeOperand(dst, result);
          this.updateFlags(result);
          cycle.phases.push({ name: 'execute', description: `ALU: 0x${dstVal.value.toString(16)} XOR 0x${srcVal.value.toString(16)} = 0x${result.toString(16)}`, component: 'alu', operation: 'xor' });
          if (dst.type === 'register') cycle.registersModified.push(dst.value);
          break;
        }
        case 'NOT': {
          const val = this.resolveOperand(dst);
          const result = ~val.value;
          this.writeOperand(dst, result);
          cycle.phases.push({ name: 'execute', description: `ALU: NOT 0x${val.value.toString(16)} = 0x${(result & 0xFFFFFFFF).toString(16)}`, component: 'alu', operation: 'not' });
          if (dst.type === 'register') cycle.registersModified.push(dst.value);
          break;
        }
        case 'SHL': {
          const dstVal = this.resolveOperand(dst);
          const srcVal = this.resolveOperand(src);
          const result = dstVal.value << srcVal.value;
          this.writeOperand(dst, result);
          this.updateFlags(result);
          cycle.phases.push({ name: 'execute', description: `ALU: ${dstVal.value} << ${srcVal.value} = ${result}`, component: 'alu', operation: 'shl' });
          if (dst.type === 'register') cycle.registersModified.push(dst.value);
          break;
        }
        case 'SHR': {
          const dstVal = this.resolveOperand(dst);
          const srcVal = this.resolveOperand(src);
          const result = dstVal.value >>> srcVal.value;
          this.writeOperand(dst, result);
          this.updateFlags(result);
          cycle.phases.push({ name: 'execute', description: `ALU: ${dstVal.value} >>> ${srcVal.value} = ${result}`, component: 'alu', operation: 'shr' });
          if (dst.type === 'register') cycle.registersModified.push(dst.value);
          break;
        }
        case 'CMP': {
          const dstVal = this.resolveOperand(dst);
          const srcVal = this.resolveOperand(src);
          const result = dstVal.value - srcVal.value;
          this.updateFlags(result);
          cycle.phases.push({ name: 'execute', description: `ALU: Compare ${dstVal.value} vs ${srcVal.value} → ZF=${this.flags.ZF}, SF=${this.flags.SF}, CF=${this.flags.CF}`, component: 'alu', operation: 'cmp' });
          break;
        }
        case 'JMP': {
          const target = this.resolveOperand(dst);
          this.registers.EIP = target.value;
          cycle.phases.push({ name: 'execute', description: `Jump to ${dst.value} (instruction ${target.value})`, component: 'control' });
          break;
        }
        case 'JE': case 'JZ': {
          const target = this.resolveOperand(dst);
          if (this.flags.ZF === 1) { this.registers.EIP = target.value; }
          cycle.phases.push({ name: 'execute', description: `JE/JZ: ZF=${this.flags.ZF} → ${this.flags.ZF ? 'JUMP to ' + dst.value : 'no jump'}`, component: 'control' });
          break;
        }
        case 'JNE': case 'JNZ': {
          const target = this.resolveOperand(dst);
          if (this.flags.ZF === 0) { this.registers.EIP = target.value; }
          cycle.phases.push({ name: 'execute', description: `JNE/JNZ: ZF=${this.flags.ZF} → ${!this.flags.ZF ? 'JUMP to ' + dst.value : 'no jump'}`, component: 'control' });
          break;
        }
        case 'JG': case 'JNLE': {
          const target = this.resolveOperand(dst);
          if (this.flags.ZF === 0 && this.flags.SF === this.flags.OF) { this.registers.EIP = target.value; }
          cycle.phases.push({ name: 'execute', description: `JG: ${(this.flags.ZF === 0 && this.flags.SF === this.flags.OF) ? 'JUMP' : 'no jump'}`, component: 'control' });
          break;
        }
        case 'JL': case 'JNGE': {
          const target = this.resolveOperand(dst);
          if (this.flags.SF !== this.flags.OF) { this.registers.EIP = target.value; }
          cycle.phases.push({ name: 'execute', description: `JL: ${(this.flags.SF !== this.flags.OF) ? 'JUMP' : 'no jump'}`, component: 'control' });
          break;
        }
        case 'JGE': case 'JNL': {
          const target = this.resolveOperand(dst);
          if (this.flags.SF === this.flags.OF) { this.registers.EIP = target.value; }
          cycle.phases.push({ name: 'execute', description: `JGE: ${(this.flags.SF === this.flags.OF) ? 'JUMP' : 'no jump'}`, component: 'control' });
          break;
        }
        case 'JLE': case 'JNG': {
          const target = this.resolveOperand(dst);
          if (this.flags.ZF === 1 || this.flags.SF !== this.flags.OF) { this.registers.EIP = target.value; }
          cycle.phases.push({ name: 'execute', description: `JLE: ${(this.flags.ZF === 1 || this.flags.SF !== this.flags.OF) ? 'JUMP' : 'no jump'}`, component: 'control' });
          break;
        }
        case 'PUSH': {
          const val = this.resolveOperand(dst);
          this.pushStack(val.value);
          cycle.phases.push({ name: 'execute', description: `PUSH ${val.value} → Stack [ESP=0x${this.registers.ESP.toString(16)}]`, component: 'memory' });
          cycle.registersModified.push('ESP');
          cycle.memoryAccessed.push({ type: 'write', address: this.registers.ESP });
          break;
        }
        case 'POP': {
          const val = this.popStack();
          this.writeOperand(dst, val);
          cycle.phases.push({ name: 'execute', description: `POP → ${val} from Stack [ESP=0x${this.registers.ESP.toString(16)}]`, component: 'memory' });
          if (dst.type === 'register') cycle.registersModified.push(dst.value);
          cycle.registersModified.push('ESP');
          break;
        }
        case 'CALL': {
          const target = this.resolveOperand(dst);
          this.pushStack(this.registers.EIP); // Push return address
          this.registers.EIP = target.value;
          cycle.phases.push({ name: 'execute', description: `CALL ${dst.value}: push return addr ${this.registers.EIP}, jump to ${target.value}`, component: 'control' });
          cycle.registersModified.push('ESP', 'EIP');
          break;
        }
        case 'RET': {
          const retAddr = this.popStack();
          this.registers.EIP = retAddr;
          cycle.phases.push({ name: 'execute', description: `RET: pop return address ${retAddr}, jump back`, component: 'control' });
          cycle.registersModified.push('ESP', 'EIP');
          break;
        }
        case 'LEA': {
          // LEA dst, [addr] — load effective address
          if (src && src.type === 'memory') {
            let address = 0;
            if (src.base) address += this.getRegisterValue(src.base);
            if (src.offset !== undefined) address += src.offset;
            if (src.index) address += this.getRegisterValue(src.index);
            this.writeOperand(dst, address);
            cycle.phases.push({ name: 'execute', description: `LEA: load address 0x${address.toString(16)} into ${dst.value}` });
            if (dst.type === 'register') cycle.registersModified.push(dst.value);
          }
          break;
        }
        case 'NOP': {
          cycle.phases.push({ name: 'execute', description: 'NOP: No operation' });
          break;
        }
        case 'HLT': {
          this.halted = true;
          cycle.phases.push({ name: 'execute', description: 'HLT: CPU halted' });
          break;
        }
        case 'INT': {
          const intNum = this.resolveOperand(dst).value;
          cycle.phases.push({ name: 'execute', description: `INT 0x${intNum.toString(16)}: Software interrupt`, component: 'io' });
          if (this.ioHandlers[intNum]) {
            this.ioHandlers[intNum](this);
          }
          break;
        }
        default:
          cycle.phases.push({ name: 'execute', description: `Unknown instruction: ${op}` });
      }
    } catch (err) {
      cycle.phases.push({ name: 'execute', description: `Error: ${err.message}` });
      this.halted = true;
    }

    // WRITEBACK phase
    cycle.phases.push({ name: 'writeback', description: `Writeback complete. Modified: ${cycle.registersModified.join(', ') || 'none'}` });

    this.cycleInfo = cycle;
    if (this.onStateChange) this.onStateChange(cycle);
    return cycle;
  }

  _resolveAddress(operand) {
    let address = 0;
    if (operand.base) address += this.getRegisterValue(operand.base);
    if (operand.offset !== undefined) address += operand.offset;
    if (operand.index) address += this.getRegisterValue(operand.index);
    return address;
  }

  getState() {
    return {
      registers: { ...this.registers },
      flags: { ...this.flags },
      memory: new Uint8Array(this.memory),
      halted: this.halted,
      currentInstruction: this.registers.EIP < this.instructions.length ? this.instructions[this.registers.EIP] : null,
    };
  }
}
