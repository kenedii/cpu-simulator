// assembler.js — Intel-syntax x86-inspired assembler/parser
// Two-pass assembler: first pass collects labels, second pass generates instruction objects

const REGISTERS_32 = ['EAX', 'EBX', 'ECX', 'EDX', 'ESI', 'EDI', 'ESP', 'EBP', 'EIP'];
const REGISTERS_16 = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'SP', 'BP'];
const REGISTERS_8 = ['AL', 'AH', 'BL', 'BH', 'CL', 'CH', 'DL', 'DH'];
const ALL_REGISTERS = [...REGISTERS_32, ...REGISTERS_16, ...REGISTERS_8];

const MNEMONICS = [
  'MOV', 'ADD', 'SUB', 'MUL', 'DIV', 'INC', 'DEC', 'NEG',
  'AND', 'OR', 'XOR', 'NOT', 'SHL', 'SHR',
  'CMP', 'JMP', 'JE', 'JZ', 'JNE', 'JNZ', 'JG', 'JNLE', 'JL', 'JNGE', 'JGE', 'JNL', 'JLE', 'JNG',
  'PUSH', 'POP', 'CALL', 'RET', 'LEA',
  'NOP', 'HLT', 'INT'
];

function parseImmediate(token) {
  if (token === undefined || token === null) return NaN;
  token = token.trim();
  if (token.startsWith('0x') || token.startsWith('0X')) return parseInt(token, 16);
  if (token.startsWith('0b') || token.startsWith('0B')) return parseInt(token.substring(2), 2);
  if (token.startsWith("'") && token.endsWith("'") && token.length === 3) return token.charCodeAt(1);
  return parseInt(token, 10);
}

function isRegister(token) {
  return ALL_REGISTERS.includes(token.toUpperCase());
}

function parseOperand(token, labelMap) {
  token = token.trim();
  if (!token) return null;

  // Memory operand: [ESI], [0x80], [ESI+0x80], etc.
  const memMatch = token.match(/^\[(.+)\]$/);
  if (memMatch) {
    return parseMemoryOperand(memMatch[1]);
  }

  // Register
  if (isRegister(token)) {
    return { type: 'register', value: token.toUpperCase() };
  }

  // Immediate value
  const immVal = parseImmediate(token);
  if (!isNaN(immVal)) {
    return { type: 'immediate', value: immVal };
  }

  // Label reference
  return { type: 'label', value: token };
}

function parseMemoryOperand(expr) {
  expr = expr.trim();
  const result = { type: 'memory', base: null, index: null, offset: undefined };

  // Simple register: [ESI]
  if (isRegister(expr)) {
    result.base = expr.toUpperCase();
    return result;
  }

  // Simple immediate: [0x80]
  const immVal = parseImmediate(expr);
  if (!isNaN(immVal)) {
    result.offset = immVal;
    return result;
  }

  // Register + offset: [ESI+0x80] or [ESI+offset]
  const plusParts = expr.split('+').map(p => p.trim());
  if (plusParts.length === 2) {
    for (const part of plusParts) {
      if (isRegister(part)) {
        if (!result.base) result.base = part.toUpperCase();
        else result.index = part.toUpperCase();
      } else {
        const val = parseImmediate(part);
        if (!isNaN(val)) {
          result.offset = (result.offset || 0) + val;
        }
      }
    }
    return result;
  }

  // Register - offset: [ESI-4]
  const minusParts = expr.split('-').map(p => p.trim());
  if (minusParts.length === 2) {
    if (isRegister(minusParts[0])) {
      result.base = minusParts[0].toUpperCase();
      const val = parseImmediate(minusParts[1]);
      if (!isNaN(val)) result.offset = -val;
    }
    return result;
  }

  // Fallback: try as immediate
  result.offset = parseImmediate(expr) || 0;
  return result;
}

function splitOperands(operandStr) {
  // Split by comma, respecting brackets
  const operands = [];
  let depth = 0;
  let current = '';
  for (const ch of operandStr) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      operands.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) operands.push(current.trim());
  return operands;
}

export function assemble(sourceCode) {
  const lines = sourceCode.split('\n');
  const errors = [];
  const labelMap = {};
  const instructions = [];

  // Pass 1: Collect labels and count instructions
  let instrIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    // Remove comments
    const commentIdx = line.indexOf(';');
    if (commentIdx >= 0) line = line.substring(0, commentIdx).trim();
    if (!line) continue;

    // Check for label
    const labelMatch = line.match(/^([a-zA-Z_]\w*):(.*)$/);
    if (labelMatch) {
      const labelName = labelMatch[1];
      labelMap[labelName] = instrIndex;
      line = labelMatch[2].trim();
      if (!line) continue;
    }

    // Count this instruction
    const parts = line.split(/\s+/);
    const mnemonic = parts[0].toUpperCase();
    if (MNEMONICS.includes(mnemonic)) {
      instrIndex++;
    } else if (line) {
      errors.push({ line: i + 1, message: `Unknown instruction: ${parts[0]}` });
    }
  }

  // Pass 2: Parse instructions
  instrIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    const rawLine = lines[i];
    // Remove comments
    const commentIdx = line.indexOf(';');
    let comment = '';
    if (commentIdx >= 0) {
      comment = line.substring(commentIdx);
      line = line.substring(0, commentIdx).trim();
    }
    if (!line) continue;

    // Remove label prefix
    const labelMatch = line.match(/^([a-zA-Z_]\w*):(.*)$/);
    if (labelMatch) {
      line = labelMatch[2].trim();
      if (!line) continue;
    }

    // Parse instruction
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
    if (!MNEMONICS.includes(mnemonic)) continue;

    const operandTokens = operandStr ? splitOperands(operandStr) : [];
    const operands = operandTokens.map(t => parseOperand(t, labelMap));

    instructions.push({
      mnemonic,
      operands,
      operandsRaw: operandStr,
      raw: rawLine.trim(),
      line: i + 1, // 1-indexed source line number
      index: instrIndex,
    });
    instrIndex++;
  }

  return { instructions, labelMap, errors };
}

// Syntax highlighting helper — returns array of {text, type} tokens for a line
export function tokenizeLine(line) {
  const tokens = [];
  let remaining = line;

  // Check for comment
  const commentIdx = remaining.indexOf(';');
  let commentPart = '';
  if (commentIdx >= 0) {
    commentPart = remaining.substring(commentIdx);
    remaining = remaining.substring(0, commentIdx);
  }

  // Check for label
  const labelMatch = remaining.match(/^([a-zA-Z_]\w*):/);
  if (labelMatch) {
    tokens.push({ text: labelMatch[1], type: 'label' });
    tokens.push({ text: ':', type: 'punctuation' });
    remaining = remaining.substring(labelMatch[0].length);
  }

  // Tokenize remaining
  if (remaining.trim()) {
    const parts = remaining.match(/\S+/g) || [];
    let isFirst = true;
    let prevEnd = labelMatch ? labelMatch[0].length : 0;

    for (const part of parts) {
      const idx = remaining.indexOf(part);
      // Add leading whitespace
      if (idx > 0) {
        const ws = remaining.substring(0, idx);
        if (ws) tokens.push({ text: ws, type: 'whitespace' });
        remaining = remaining.substring(idx);
      }

      const upper = part.toUpperCase().replace(/,/g, '');

      if (isFirst && MNEMONICS.includes(upper)) {
        tokens.push({ text: part, type: 'mnemonic' });
      } else if (isRegister(upper)) {
        tokens.push({ text: part, type: 'register' });
      } else if (part.match(/^\[.*\]$/)) {
        tokens.push({ text: part, type: 'memory' });
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

export { MNEMONICS, ALL_REGISTERS };
