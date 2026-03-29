// assembler-td4.js — TD4 assembler/parser
// Supports the 12 TD4 instructions with 8-bit encoding (4-bit opcode + 4-bit immediate)

const TD4_REGISTERS = ['A', 'B'];

const TD4_MNEMONICS = [
  'ADD', 'MOV', 'IN', 'OUT', 'JZ', 'JMP', 'NOP'
];

// Opcode table: instruction key → 4-bit opcode
const OPCODE_TABLE = {
  'ADD_A': 0b0000,
  'MOV_A_B': 0b0001,
  'IN_A': 0b0010,
  'MOV_A_IM': 0b0011,
  'MOV_B_A': 0b0100,
  'ADD_B': 0b0101,
  'IN_B': 0b0110,
  'MOV_B_IM': 0b0111,
  'OUT_B': 0b1001,
  'OUT_IM': 0b1011,
  'JZ': 0b1110,
  'JMP': 0b1111,
};

function parseImmediate(token) {
  if (!token) return NaN;
  token = token.trim();
  if (token.startsWith('0x') || token.startsWith('0X')) return parseInt(token, 16);
  if (token.startsWith('0b') || token.startsWith('0B')) return parseInt(token.substring(2), 2);
  return parseInt(token, 10);
}

export function assembleTD4(sourceCode, maxInstructions = 16) {
  const lines = sourceCode.split('\n');
  const errors = [];
  const instructions = [];
  const labelMap = {};

  // Pass 1: collect labels
  let instrIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    const commentIdx = line.indexOf(';');
    if (commentIdx >= 0) line = line.substring(0, commentIdx).trim();
    if (!line) continue;

    const labelMatch = line.match(/^([a-zA-Z_]\w*):\s*(.*)$/);
    if (labelMatch) {
      labelMap[labelMatch[1]] = instrIndex;
      line = labelMatch[2].trim();
      if (!line) continue;
    }

    const parts = line.split(/\s+/);
    const mnemonic = parts[0].toUpperCase();
    if (TD4_MNEMONICS.includes(mnemonic)) {
      instrIndex++;
    } else if (line) {
      errors.push({ line: i + 1, message: `Unknown instruction: ${parts[0]}` });
    }
  }

  if (instrIndex > maxInstructions) {
    errors.push({ line: 0, message: `Program too long: ${instrIndex} instructions (max ${maxInstructions} for current TD4 config)` });
  }

  // Pass 2: encode
  instrIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    const rawLine = lines[i];
    const commentIdx = line.indexOf(';');
    if (commentIdx >= 0) line = line.substring(0, commentIdx).trim();
    if (!line) continue;

    const labelMatch = line.match(/^([a-zA-Z_]\w*):\s*(.*)$/);
    if (labelMatch) {
      line = labelMatch[2].trim();
      if (!line) continue;
    }

    const firstSpace = line.indexOf(' ');
    let mnemonic, operandStr;
    if (firstSpace === -1) {
      mnemonic = line;
      operandStr = '';
    } else {
      mnemonic = line.substring(0, firstSpace);
      operandStr = line.substring(firstSpace + 1).trim();
    }
    mnemonic = mnemonic.toUpperCase();
    if (!TD4_MNEMONICS.includes(mnemonic)) continue;

    const operands = operandStr ? operandStr.split(',').map(s => s.trim()) : [];
    let opcode = 0;
    let im = 0;
    let instrKey = mnemonic;

    switch (mnemonic) {
      case 'ADD': {
        const reg = operands[0]?.toUpperCase();
        const imStr = operands[1];
        if (reg === 'A') {
          instrKey = 'ADD_A';
          im = parseImmediate(imStr) & 0xF;
        } else if (reg === 'B') {
          instrKey = 'ADD_B';
          im = parseImmediate(imStr) & 0xF;
        } else {
          errors.push({ line: i + 1, message: `ADD requires register A or B, got: ${reg}` });
          continue;
        }
        opcode = OPCODE_TABLE[instrKey];
        break;
      }
      case 'MOV': {
        const dst = operands[0]?.toUpperCase();
        const src = operands[1]?.toUpperCase();
        if (dst === 'A' && src === 'B') {
          instrKey = 'MOV_A_B';
          opcode = OPCODE_TABLE.MOV_A_B;
          im = 0;
        } else if (dst === 'B' && src === 'A') {
          instrKey = 'MOV_B_A';
          opcode = OPCODE_TABLE.MOV_B_A;
          im = 0;
        } else if (dst === 'A') {
          instrKey = 'MOV_A_IM';
          opcode = OPCODE_TABLE.MOV_A_IM;
          im = parseImmediate(operands[1]) & 0xF;
        } else if (dst === 'B') {
          instrKey = 'MOV_B_IM';
          opcode = OPCODE_TABLE.MOV_B_IM;
          im = parseImmediate(operands[1]) & 0xF;
        } else {
          errors.push({ line: i + 1, message: `MOV: invalid operands: ${operandStr}` });
          continue;
        }
        break;
      }
      case 'IN': {
        const reg = operands[0]?.toUpperCase();
        if (reg === 'A') {
          instrKey = 'IN_A';
          opcode = OPCODE_TABLE.IN_A;
        } else if (reg === 'B') {
          instrKey = 'IN_B';
          opcode = OPCODE_TABLE.IN_B;
        } else {
          errors.push({ line: i + 1, message: `IN requires register A or B` });
          continue;
        }
        im = 0;
        break;
      }
      case 'OUT': {
        const arg = operands[0]?.toUpperCase();
        if (arg === 'B') {
          instrKey = 'OUT_B';
          opcode = OPCODE_TABLE.OUT_B;
          im = 0;
        } else {
          instrKey = 'OUT_IM';
          opcode = OPCODE_TABLE.OUT_IM;
          // Could be immediate or label
          const val = parseImmediate(operands[0]);
          if (!isNaN(val)) {
            im = val & 0xF;
          } else {
            errors.push({ line: i + 1, message: `OUT: invalid operand: ${operands[0]}` });
            continue;
          }
        }
        break;
      }
      case 'JZ': {
        instrKey = 'JZ';
        opcode = OPCODE_TABLE.JZ;
        const val = parseImmediate(operands[0]);
        if (!isNaN(val)) {
          im = val & 0xF;
        } else if (labelMap[operands[0]] !== undefined) {
          im = labelMap[operands[0]] & 0xF;
        } else {
          errors.push({ line: i + 1, message: `JZ: unknown label: ${operands[0]}` });
          continue;
        }
        break;
      }
      case 'JMP': {
        instrKey = 'JMP';
        opcode = OPCODE_TABLE.JMP;
        const val = parseImmediate(operands[0]);
        if (!isNaN(val)) {
          im = val & 0xF;
        } else if (labelMap[operands[0]] !== undefined) {
          im = labelMap[operands[0]] & 0xF;
        } else {
          errors.push({ line: i + 1, message: `JMP: unknown label: ${operands[0]}` });
          continue;
        }
        break;
      }
      case 'NOP': {
        opcode = 0b1000; // unused opcode = NOP
        im = 0;
        break;
      }
    }

    const fullOpcode = ((opcode & 0xF) << 4) | (im & 0xF);

    instructions.push({
      mnemonic,
      operands: operands.map(o => ({ type: 'raw', value: o })),
      operandsRaw: operandStr,
      raw: rawLine.trim(),
      line: i + 1,
      index: instrIndex,
      opcode: fullOpcode,
      instrKey,
      im,
    });
    instrIndex++;
  }

  return { instructions, labelMap, errors };
}

// Syntax highlighting for TD4
export function tokenizeLineTD4(line) {
  const tokens = [];
  let remaining = line;

  const commentIdx = remaining.indexOf(';');
  let commentPart = '';
  if (commentIdx >= 0) {
    commentPart = remaining.substring(commentIdx);
    remaining = remaining.substring(0, commentIdx);
  }

  const labelMatch = remaining.match(/^([a-zA-Z_]\w*):/);
  if (labelMatch) {
    tokens.push({ text: labelMatch[1], type: 'label' });
    tokens.push({ text: ':', type: 'punctuation' });
    remaining = remaining.substring(labelMatch[0].length);
  }

  if (remaining.trim()) {
    const parts = remaining.match(/\S+/g) || [];
    let isFirst = true;
    for (const part of parts) {
      const idx = remaining.indexOf(part);
      if (idx > 0) {
        const ws = remaining.substring(0, idx);
        if (ws) tokens.push({ text: ws, type: 'whitespace' });
        remaining = remaining.substring(idx);
      }
      const upper = part.toUpperCase().replace(/,/g, '');
      if (isFirst && TD4_MNEMONICS.includes(upper)) {
        tokens.push({ text: part, type: 'mnemonic' });
      } else if (TD4_REGISTERS.includes(upper)) {
        tokens.push({ text: part, type: 'register' });
      } else if (part.match(/^0x[0-9a-fA-F]+$/i) || part.match(/^0b[01]+$/i) || part.match(/^\d+$/)) {
        tokens.push({ text: part, type: 'number' });
      } else if (part === ',') {
        tokens.push({ text: part, type: 'punctuation' });
      } else {
        tokens.push({ text: part, type: 'label-ref' });
      }
      remaining = remaining.substring(part.length);
      isFirst = false;
    }
  }

  if (commentPart) {
    tokens.push({ text: commentPart, type: 'comment' });
  }

  return tokens;
}

// TD4-specific examples
export const TD4_EXAMPLES = [
  {
    name: "LED Counter",
    description: "Counts 0-15 on the output LEDs. Shows the basic OUT instruction and how the 4-bit output port works.",
    code: `; LED Counter (TD4)
; Counts 0-15 on output LEDs
; Demonstrates: MOV, ADD, OUT, JMP

MOV A, 0      ; Start at 0
loop:
OUT B         ; Output B to LEDs
ADD B, 1      ; Increment B
JMP loop      ; Repeat forever`
  },
  {
    name: "Ramp Pattern",
    description: "Outputs values 1, 2, 4, 8 to LEDs creating a shift pattern using immediate outputs.",
    code: `; Ramp Pattern (TD4)
; Outputs shifting LED pattern
; Demonstrates: OUT Im, JMP

loop:
OUT 0b0001    ; LED 0 on
OUT 0b0010    ; LED 1 on
OUT 0b0100    ; LED 2 on
OUT 0b1000    ; LED 3 on
OUT 0b0100    ; LED 2 on
OUT 0b0010    ; LED 1 on
JMP loop      ; Repeat`
  },
  {
    name: "Add Two Numbers",
    description: "Adds 3 + 5 = 8 and outputs the result to LEDs. Shows the ALU (74HC283 adder) in action.",
    code: `; Add Two Numbers (TD4)
; Computes 3 + 5 = 8 → output
; Demonstrates: MOV, ADD, MOV B A, OUT

MOV A, 3      ; Load 3 into A
ADD A, 5      ; A = 3 + 5 = 8
MOV B, A      ; Copy A to B
OUT B         ; Output result
loop:
JMP loop      ; Stop by looping`
  },
  {
    name: "Input Echo",
    description: "Reads the 4-bit input port and echoes it to the output LEDs. Demonstrates the IN instruction.",
    code: `; Input Echo (TD4)
; Reads input switches → output LEDs
; Demonstrates: IN, MOV, OUT, JMP

loop:
IN A          ; Read input port into A
MOV B, A      ; Copy to B
OUT B         ; Output to LEDs
JMP loop      ; Repeat`
  },
  {
    name: "Knight Rider LEDs",
    description: "Classic KITT scanner pattern on 4 LEDs. A famous demo for simple CPUs!",
    code: `; Knight Rider (TD4)
; Bouncing LED pattern
; Demonstrates: OUT Im, JMP

loop:
OUT 0b0001
OUT 0b0010
OUT 0b0100
OUT 0b1000
OUT 0b0100
OUT 0b0010
JMP loop`
  },
];

export { TD4_MNEMONICS, TD4_REGISTERS };
