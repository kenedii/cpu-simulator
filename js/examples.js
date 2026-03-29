// examples.js — Example assembly programs for x86 mode
// Each example demonstrates different instructions and IO devices

const EXAMPLES = [
  {
    name: "Add Two Numbers",
    description: "Adds 5 and 3, stores result in EAX. Great first program to see how the ALU works.",
    code: `; Add Two Numbers
; Demonstrates: MOV, ADD, HLT
; Result: EAX = 8

MOV EAX, 5       ; Load 5 into EAX
MOV EBX, 3       ; Load 3 into EBX
ADD EAX, EBX     ; EAX = EAX + EBX = 8
HLT              ; Stop execution`
  },
  {
    name: "Hello World (Monitor)",
    description: "Prints 'HELLO WORLD!' to the text monitor. Open the I/O tab to see output. Uses INT 0x10 to output each character.",
    code: `; Hello World — Text Monitor
; Demonstrates: MOV, INT 0x10, INC, CMP, JNE
; Output: "HELLO WORLD!" on the text monitor
; TIP: Click the I/O tab to see the monitor!

; Print each character directly via register
MOV AL, 0x48     ; 'H'
INT 0x10
MOV AL, 0x45     ; 'E'
INT 0x10
MOV AL, 0x4C     ; 'L'
INT 0x10
MOV AL, 0x4C     ; 'L'
INT 0x10
MOV AL, 0x4F     ; 'O'
INT 0x10
MOV AL, 0x20     ; ' '
INT 0x10
MOV AL, 0x57     ; 'W'
INT 0x10
MOV AL, 0x4F     ; 'O'
INT 0x10
MOV AL, 0x52     ; 'R'
INT 0x10
MOV AL, 0x4C     ; 'L'
INT 0x10
MOV AL, 0x44     ; 'D'
INT 0x10
MOV AL, 0x21     ; '!'
INT 0x10
HLT`
  },
  {
    name: "Counter with LEDs",
    description: "Counts from 0 to 255, outputting each value to the virtual LEDs. Watch the binary pattern!",
    code: `; Counter with LEDs
; Demonstrates: MOV, INC, INT 0x20, CMP, JLE, loops
; Output: LEDs show binary count 0-255

MOV EAX, 0       ; Start counter at 0

count_loop:
INT 0x20         ; Output AL to LEDs
INC EAX          ; Increment counter
CMP EAX, 255     ; Check if reached max
JLE count_loop   ; If not, keep counting
HLT              ; Done`
  },
  {
    name: "7-Segment Counter",
    description: "Counts 0 through F on the 7-segment display. Demonstrates INT 0x22.",
    code: `; 7-Segment Counter
; Demonstrates: MOV, INT 0x22, INC, CMP, JLE
; Output: 7-segment display counts 0-F

MOV EAX, 0       ; Start at 0

seg_loop:
INT 0x22         ; Output AL to 7-segment
INC EAX
CMP EAX, 15      ; Count to F (15)
JLE seg_loop
HLT`
  },
  {
    name: "Draw Pixels (Video)",
    description: "Draws a colorful diagonal pattern on the 16×16 video display. Uses INT 0x30 (set pixel) and INT 0x31 (fill).",
    code: `; Draw Pixels — Video Display
; Demonstrates: INT 0x30 (set pixel), INT 0x31 (fill)
; AL=color, AH=X, BL=Y
; Open I/O tab to see the display!

; Fill screen with dark blue
MOV AL, 1        ; Color 1 = dark blue
INT 0x31         ; Fill entire screen

; Draw a diagonal line in white
MOV ECX, 0       ; Loop counter

draw_loop:
MOV AH, CL      ; X = counter
MOV BL, CL      ; Y = counter
MOV AL, 15       ; Color 15 = white
INT 0x30         ; Set pixel at (X, Y)
INC ECX
CMP ECX, 16
JL draw_loop

; Draw red border top
MOV ECX, 0
top_border:
MOV AH, CL
MOV BL, 0
MOV AL, 4        ; Red
INT 0x30
INC ECX
CMP ECX, 16
JL top_border

HLT`
  },
  {
    name: "Fibonacci Sequence",
    description: "Computes Fibonacci numbers and outputs each to the LEDs and 7-segment display.",
    code: `; Fibonacci with LED output
; Demonstrates: ADD, MOV, INT 0x20, INT 0x22

MOV EAX, 1       ; F(1) = 1
MOV EBX, 0       ; F(0) = 0

fib_loop:
INT 0x20         ; Show current on LEDs
INT 0x22         ; Show on 7-segment
MOV EDX, EAX     ; temp = A
ADD EAX, EBX     ; A = A + B
MOV EBX, EDX     ; B = old A
CMP EAX, 255     ; Stop at 255
JLE fib_loop
HLT`
  },
  {
    name: "Factorial (Recursive)",
    description: "Computes 5! = 120 using recursive CALL/RET and the stack.",
    code: `; Factorial - Recursive
; Demonstrates: CALL, RET, PUSH, POP, MUL, CMP, stack
; Result: EAX = 5! = 120

MOV EAX, 5       ; Compute factorial of 5
CALL factorial   ; Call factorial function
INT 0x20         ; Show result on LEDs
HLT              ; EAX now contains 120

factorial:
CMP EAX, 1       ; Base case: n <= 1?
JLE base_case
PUSH EAX         ; Save n on stack
DEC EAX          ; n - 1
CALL factorial   ; Recurse with n-1
POP EBX          ; Retrieve saved n
MUL EBX          ; EAX = EAX * EBX
RET

base_case:
MOV EAX, 1       ; Return 1
RET`
  },
  {
    name: "Multiply by Shift-and-Add",
    description: "Multiplies two numbers using only shifts and adds — how hardware actually does it!",
    code: `; Multiply by Shift-and-Add
; Demonstrates: SHL, SHR, AND, ADD, JE, bit manipulation
; Computes: 13 * 11 = 143

MOV EAX, 13      ; Multiplicand
MOV EBX, 11      ; Multiplier
MOV EDX, 0       ; Result accumulator

mul_loop:
CMP EBX, 0       ; If multiplier is 0, done
JE mul_done
MOV ECX, EBX     ; Copy multiplier
AND ECX, 1       ; Check lowest bit
CMP ECX, 0       ; If bit is 0, skip add
JE skip_add
ADD EDX, EAX     ; Add multiplicand to result

skip_add:
SHL EAX, 1       ; Shift multiplicand left
SHR EBX, 1       ; Shift multiplier right
JMP mul_loop

mul_done:
MOV EAX, EDX     ; Move result to EAX
INT 0x20         ; Show on LEDs
HLT`
  },
  {
    name: "Echo Console Input",
    description: "Reads characters from the input console (INT 0x21) and echoes them to the text monitor (INT 0x10). Type something in the Input Console first!",
    code: `; Echo Console Input
; Demonstrates: INT 0x21 (read), INT 0x10 (write)
; Type in the Input Console, click Send, then Run

echo_loop:
INT 0x21         ; Read char into AL
CMP AL, 0        ; No input?
JE echo_loop     ; Wait for input
CMP AL, 10       ; Newline?
JE done
INT 0x10         ; Echo to monitor
JMP echo_loop

done:
HLT`
  },
  {
    name: "Stack Calculator",
    description: "Uses PUSH/POP to evaluate (3 + 7) × 2 = 20 using a stack-based approach. Shows result on LEDs.",
    code: `; Stack Calculator
; Demonstrates: PUSH, POP, ADD, MUL, stack operations
; Evaluates: (3 + 7) * 2 = 20

PUSH 3           ; Push 3
PUSH 7           ; Push 7
POP EBX          ; Pop 7
POP EAX          ; Pop 3
ADD EAX, EBX     ; EAX = 10

PUSH EAX         ; Push 10
PUSH 2           ; Push 2
POP EBX          ; Pop 2
POP EAX          ; Pop 10
MUL EBX          ; EAX = 20

INT 0x20         ; Show on LEDs
INT 0x22         ; Show on 7-seg (will show 4, since 20 mod 16 = 4)
HLT`
  }
];

export default EXAMPLES;
