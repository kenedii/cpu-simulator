export class ChatAssistant {
  constructor() {
    this.provider = localStorage.getItem('chat-provider') || 'openai';
    this.apiKey = localStorage.getItem('chat-api-key') || '';
    this.modelName = localStorage.getItem('chat-model') || '';
    
    this.initUI();
    this.bindEvents();
  }

  initUI() {
    this.els = {
      history: document.getElementById('chat-history'),
      input: document.getElementById('chat-input'),
      sendBtn: document.getElementById('chat-send-btn'),
      newBtn: document.getElementById('chat-new-btn'),
      settingsBtn: document.getElementById('chat-settings-btn'),
      settingsModal: document.getElementById('chat-settings-modal'),
      settingsClose: document.getElementById('chat-settings-close'),
      settingsSave: document.getElementById('chat-settings-save'),
      providerSelect: document.getElementById('chat-provider'),
      apiKeyInput: document.getElementById('chat-api-key'),
      modelInput: document.getElementById('chat-model'),
    };

    if (this.els.providerSelect) {
      this.els.providerSelect.value = this.provider;
      this.els.apiKeyInput.value = this.apiKey;
      this.els.modelInput.value = this.modelName;
    }
  }

  bindEvents() {
    if (!this.els.sendBtn) return;
    this.els.sendBtn.addEventListener('click', () => this.handleSend());
    if (this.els.newBtn) {
      this.els.newBtn.addEventListener('click', () => this.handleNewChat());
    }
    this.els.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    this.els.settingsBtn.addEventListener('click', () => {
      this.els.settingsModal.classList.add('visible');
    });

    this.els.settingsClose.addEventListener('click', () => {
      this.els.settingsModal.classList.remove('visible');
    });
    
    this.els.settingsSave.addEventListener('click', () => {
      this.provider = this.els.providerSelect.value;
      this.apiKey = this.els.apiKeyInput.value;
      this.modelName = this.els.modelInput.value;
      
      localStorage.setItem('chat-provider', this.provider);
      localStorage.setItem('chat-api-key', this.apiKey);
      localStorage.setItem('chat-model', this.modelName);
      
      this.els.settingsModal.classList.remove('visible');
      this.appendMessage('assistant', 'Settings saved.');
    });
    
    document.addEventListener('click', (e) => {
      if (e.target && e.target.classList.contains('chat-apply-btn')) {
        const code = e.target.getAttribute('data-code');
        if (window.editor) {
          window.editor.setValue(decodeURIComponent(code));
        }
      }
    });
  }

  handleNewChat() {
    this.els.history.innerHTML = '<div class="chat-message assistant">Hello! I am an AI designed to create code for a simulated basic educational implementation of this CPU architecture. How can I help?</div>';
  }

  appendMessage(role, content) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${role}`;
    
    if (role === 'assistant') {
      msgDiv.innerHTML = this.parseMarkdown(content);
    } else {
      msgDiv.textContent = content; // User text is escaped via textContent
    }
    
    this.els.history.appendChild(msgDiv);
    this.els.history.scrollTop = this.els.history.scrollHeight;
  }
  
  parseMarkdown(text) {
    const parts = text.split(/(```[a-z]*\n[\s\S]*?```)/);
    return parts.map(part => {
      if (part.startsWith('```')) {
        const lines = part.split('\n');
        const mType = lines.shift().slice(3); // language
        lines.pop(); // remove trailing ```
        const codeText = lines.join('\n');
        
        const safeCode = encodeURIComponent(codeText);
        return `<pre><code class="${mType}">${this.escapeHtml(codeText)}</code></pre>
                <button class="chat-apply-btn" data-code="${safeCode}">Apply to Editor</button>`;
      }
      return `<p>${this.escapeHtml(part).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}</p>`;
    }).join('');
  }

  escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async handleSend() {
    const text = this.els.input.value.trim();
    if (!text) return;
    
    if (!this.apiKey) {
      this.appendMessage('assistant', 'API Key missing. Please click the ⚙️ icon to set your API key first.');
      return;
    }

    this.els.input.value = '';
    this.appendMessage('user', text);
    
    const context = window.editor ? "\nCurrent Editor Content:\n```assembly\n" + window.editor.getValue() + "\n```\n" : "";

    const userMessage = { role: 'user', content: text + context };

    this.appendMessage('assistant', '...');
    const loadingElem = this.els.history.lastElementChild;

    try {
      const response = await this.callLLM(userMessage);
      loadingElem.remove();
      this.appendMessage('assistant', response);
    } catch (err) {
      loadingElem.remove();
      this.appendMessage('assistant', 'Error: ' + err.message);
    }
  }

  getSystemPrompt() {
    const arch = window.app && window.app.architecture ? window.app.architecture : 'td4';
    let archInfo = '';
    let exampleCode = '';

    if (arch === 'x86') {
      archInfo = `You are an AI designed to read and write assembly code for a simulated basic educational graphical CPU architecture (x86 subset).
YOU ONLY HAVE ACCESS TO THE FOLLOWING INSTRUCTIONS. DO NOT USE ANY OTHER INSTRUCTIONS.
Registers (32-bit): EAX, EBX, ECX, EDX, ESI, EDI, ESP, EBP, EIP.
Supported Operations: MOV, ADD, SUB, MUL, DIV, INC, DEC, NEG, AND, OR, XOR, NOT, SHL, SHR, CMP, JMP, JE, JZ, JNE, JNZ, JG, JNLE, JL, JNGE, JGE, JNL, JLE, JNG, PUSH, POP, CALL, RET, LEA, NOP, HLT, INT.

I/O is ONLY handled via the INT instruction:
- INT 0x10 : Print character in AL to text monitor.
- INT 0x20 : Write value in AL to 8-bit LEDs.
- INT 0x21 : Read next character from console into AL.
- INT 0x22 : Write value in AL to 7-segment display.
- INT 0x30 : Set Video Pixel (color=AL, X=AH, Y=BL).
- INT 0x31 : Fill Video with color in AL.`;
      
      exampleCode = `Example loop printing 'A' (char 0x41):
\`\`\`assembly
MOV ECX, 5       ; Counter
MOV EAX, 0       ; Reset EAX
MOV AL, 0x41     ; Load 'A' into AL

loop_start:
  INT 0x10       ; Print AL character to monitor
  DEC ECX        ; Decrement counter
  CMP ECX, 0     ; Check if 0
  JNE loop_start ; Loop if not zero
  HLT            ; Halt CPU
\`\`\``;
    } else {
      archInfo = `You are an AI designed to read and write assembly code for a simulated basic educational graphical TD4 CPU architecture (4-bit).
YOU ONLY HAVE ACCESS TO THE FOLLOWING INSTRUCTIONS. DO NOT USE ANY OTHER INSTRUCTIONS.
Registers (4-bit): A, B.
Supported Operations: 
- ADD A,Im (Add immediate to A)
- ADD B,Im (Add immediate to B)
- MOV A,B (Copy B to A)
- MOV B,A (Copy A to B)
- MOV A,Im (Load immediate to A)
- MOV B,Im (Load immediate to B)
- IN A (Read input switches to A)
- IN B (Read input switches to B)
- OUT B (Write B to output LEDs)
- OUT Im (Write immediate to output LEDs)
- JMP Im (Jump to immediate address unconditionally)
- JZ Im (Jump to immediate address IF CARRY FLAG IS ZERO - Note: In TD4, JNC is written as JZ)
- NOP
- HLT`;
      exampleCode = `Example loop writing input to output:
\`\`\`assembly
loop:
  IN A        ; Read from input switches to Reg A
  MOV B, A    ; Copy A to B
  OUT B       ; Output Reg B to LEDs
  ADD A, 1    ; Add 1 to A
  JMP loop    ; Repeat forever
\`\`\``;
    }

    return `${archInfo}

Format your code blocks using markdown triple backticks with 'assembly' as the language.
Example of writing code to the editor:
${exampleCode}
When you output a codeblock, the user can apply it directly to the editor by clicking an inline button. DO NOT use instructions outside of the specified lists.`;
  }

  async callLLM(userMessage) {
    const systemPromptMessage = { role: 'system', content: this.getSystemPrompt() };
    let messages = [systemPromptMessage, userMessage];

    if (this.provider === 'openai') {
      const model = this.modelName || 'gpt-4o-mini';
      return this.fetchOpenAI('https://api.openai.com/v1/chat/completions', model, messages, `Bearer ${this.apiKey}`);
    } 
    else if (this.provider === 'deepseek') {
      const model = this.modelName || 'deepseek-chat';
      return this.fetchOpenAI('https://api.deepseek.com/chat/completions', model, messages, `Bearer ${this.apiKey}`);
    }
    else if (this.provider === 'anthropic') {
      const model = this.modelName || 'claude-3-haiku-20240307';
      const anthropicMsgs = [userMessage]; 
      return this.fetchAnthropic('https://api.anthropic.com/v1/messages', model, this.getSystemPrompt(), anthropicMsgs, this.apiKey);
    }
    else if (this.provider === 'gemini') {
      const model = this.modelName || 'gemini-1.5-flash';
      // Gemini strict system mapping
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
      const contents = [{
        role: "user",
        parts: [{ text: this.getSystemPrompt() + "\n\n" + userMessage.content }]
      }];
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.candidates[0].content.parts[0].text;
    }
    throw new Error('Unknown provider');
  }

  async fetchOpenAI(url, model, messages, authHeader) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({ model, messages, temperature: 0.7 })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.choices[0].message.content;
  }

  async fetchAnthropic(url, model, system, messages, apiKey) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        system,
        messages,
        max_tokens: 1024
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.content[0].text;
  }
}
