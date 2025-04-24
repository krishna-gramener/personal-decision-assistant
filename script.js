// DOM Elements
const questionForm = document.getElementById("questionForm");
const questionInput = document.getElementById("questionInput");
const loadingSpinner = document.getElementById("loadingSpinner");
const loadingMessage = document.getElementById("loadingMessage");
const errorAlert = document.getElementById("errorAlert");
const errorMessage = document.getElementById("errorMessage");
const expertsContainer = document.getElementById("expertsContainer");
const mindmapsContainer = document.getElementById("mindmapsContainer");
const fileInput = document.getElementById("fileInput");
const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const fileList = document.getElementById("fileList");
const chatContainer = document.getElementById("chatContainer");
const followupContainer = document.getElementById("followupContainer");
let key =
  "API TOKEN";
// Store conversation history
let conversationHistory = [];
// Store current experts data
let currentExpertsData = [];


// Show loading state
function showLoading(message) {
  loadingMessage.textContent = message;
  loadingSpinner.classList.remove("hidden");
}

// Hide loading state
function hideLoading() {
  loadingSpinner.classList.add("hidden");
}

// Show error message
function showError(message) {
  errorMessage.textContent = message;
  errorAlert.classList.remove("hidden");
}

// Call OpenAI API
async function callOpenAI(systemPrompt, userMessage) {
  try {
    const response = await fetch(
      "API URL",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-nano",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        }),
      }
    );

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "API error occurred");
    }

    return data.choices?.[0]?.message?.content || "No response received";
  } catch (error) {
    throw new Error(`API call failed: ${error.message}`);
  }
}

// Get experts for the roundtable
async function getExperts(question) {
  showLoading("Identifying expert panel...");

  const systemPrompt = `
    You are an assistant tasked with identifying 3 experts for a roundtable discussion
    on a specific question. These experts should be relevant to analyzing and answering questions about the provided documents.
    
    Consider the full conversation history when selecting experts, as the current question may relate to previous discussion points.
    
    For the given question, conversation history, and document context, suggest 3 distinct experts who would
    have valuable perspectives on the topic. Each expert should have different specialties
    and backgrounds to ensure diverse insights.

    The experts should be able to analyze and interpret:
    - Document content and structure
    - Data patterns and relationships
    - Technical and domain-specific aspects
    - Contextual information
    - Previous conversation points and their relationships

    Provide your response in JSON format with the following structure:
    {
      "experts": [
        {
          "title": "Expert's title/profession",
          "specialty": "Expert's area of expertise",
          "background": "Brief 1-2 sentence background on why this expert is relevant and what they bring to the table with respect to the question, documents, and conversation history"
        },
        {...},
        {...}
      ]
    }
  `;

  const conversationContext = getConversationContext();
  const userMessage = `
    Question: ${question}

    Previous Conversation:
    ${conversationContext}

    Available document content:
    ${extractedData.pdfs.map(pdf => `PDF: ${pdf.filename}\nContent: ${pdf.content}`).join('\n\n')}
    ${extractedData.excel.map(excel => `Excel: ${excel.filename}\nContent: ${JSON.stringify(excel.content)}`).join('\n\n')}
    ${extractedData.csv.map(csv => `CSV: ${csv.filename}\nContent: ${JSON.stringify(csv.content)}`).join('\n\n')}
    ${extractedData.docx.map(docx => `DOCX: ${docx.filename}\nContent: ${docx.content}`).join('\n\n')}
  `;

  try {
    const response = await callOpenAI(systemPrompt, userMessage);
    return JSON.parse(response).experts;
  } catch (error) {
    throw new Error(`Failed to identify experts: ${error.message}`);
  }
}

// Generate questions for each expert
async function generateExpertQuestions(question, expert) {
  const systemPrompt = `
    You are an assistant tasked with generating 3 insightful questions related to the user's
    main question. These questions should be specialized for ${expert.title}
    with expertise in ${expert.specialty}.

    Generate questions that:
    1. Leverage this expert's unique perspective and knowledge
    2. Focus on analyzing and interpreting the provided document content
    3. Help extract meaningful insights from the available data
    4. Address specific aspects of the user's question in relation to the documents

    Your questions should be clear, specific, and directly related to the content of the uploaded documents.
  `;

  const documentContext = `
    Available document content:
    ${extractedData.pdfs.map(pdf => `PDF: ${pdf.filename}\nContent: ${pdf.content}`).join('\n\n')}
    ${extractedData.excel.map(excel => `Excel: ${excel.filename}\nContent: ${JSON.stringify(excel.content)}`).join('\n\n')}
    ${extractedData.csv.map(csv => `CSV: ${csv.filename}\nContent: ${JSON.stringify(csv.content)}`).join('\n\n')}
    ${extractedData.docx.map(docx => `DOCX: ${docx.filename}\nContent: ${docx.content}`).join('\n\n')}
  `;

  try {
    const response = await callOpenAI(
      systemPrompt,
      `Question: ${question}\n\nDocument Context:\n${documentContext}\n\nExpert Background: ${expert.background}`
    );
    return response.split("\n").filter((q) => q.trim());
  } catch (error) {
    throw new Error(
      `Failed to generate questions for ${expert.title}: ${error.message}`
    );
  }
}

// Get expert answers
async function getExpertAnswers(question, expert, expertQuestions) {
  const systemPrompt = `
    You are ${expert.title}, an expert in ${expert.specialty}. 
    ${expert.background}

    Answer the following questions based on your expertise and the provided document content.
    Your answers should:
    1. Be directly based on the content from the uploaded documents
    2. Reference specific data points or sections from the documents
    3. Provide clear, factual responses supported by the available information
    4. Stay focused on your area of expertise while analyzing the document content
  `;

  const documentContext = `
    Available document content:
    ${extractedData.pdfs.map(pdf => `PDF: ${pdf.filename}\nContent: ${pdf.content}`).join('\n\n')}
    ${extractedData.excel.map(excel => `Excel: ${excel.filename}\nContent: ${JSON.stringify(excel.content)}`).join('\n\n')}
    ${extractedData.csv.map(csv => `CSV: ${csv.filename}\nContent: ${JSON.stringify(csv.content)}`).join('\n\n')}
    ${extractedData.docx.map(docx => `DOCX: ${docx.filename}\nContent: ${docx.content}`).join('\n\n')}
  `;

  try {
    const response = await callOpenAI(
      systemPrompt,
      `Main Question: ${question}\n\nDocument Context:\n${documentContext}\n\nQuestions to Answer:\n${expertQuestions.join(
        "\n"
      )}`
    );
    return response.split("\n").filter((a) => a.trim());
  } catch (error) {
    throw new Error(
      `Failed to get answers from ${expert.title}: ${error.message}`
    );
  }
}

// Generate expert summary
async function generateExpertSummary(question, expert, questionsAndAnswers) {
  const systemPrompt = `
    You are an assistant tasked with summarizing the insights provided by ${expert.name},
    a ${expert.title} with expertise in ${expert.specialty}.

    Review the expert's answers to the specialized questions and create a concise summary
    of their key points and contributions to addressing the main question.

    The summary should be 2-3 paragraphs and highlight the unique perspective this expert brings.
  `;

  const userMessage = `
    Main question: ${question}

    Expert: ${expert.name}, ${expert.title}
    Specialty: ${expert.specialty}
    Background: ${expert.background}

    Q&A:
    ${questionsAndAnswers
      .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
      .join("\n\n")}
  `;

  try {
    return await callOpenAI(systemPrompt, userMessage);
  } catch (error) {
    throw new Error(
      `Failed to generate summary for ${expert.name}: ${error.message}`
    );
  }
}

// Helper to extract mermaid code from LLM response
function extractMermaidCode(response) {
  try {
    const mermaidMatch = response.match(/```mermaid\s*([\s\S]*?)```/i);
    if (!mermaidMatch || !mermaidMatch[1]) {
      console.warn('No mermaid code block found in response');
      return null;
    }
    
    const code = mermaidMatch[1].trim();
    if (!code.startsWith('mindmap')) {
      console.warn('Invalid mindmap code - does not start with mindmap');
      return null;
    }
    
    return code;
  } catch (error) {
    console.error('Error extracting mermaid code:', error);
    return null;
  }
}

// Generate expert mindmap using LLM (after final answer)
async function generateExpertMindmapWithLLM(question, expert, questionsAndAnswers, finalAnswer) {
  const systemPrompt = `
You are an assistant tasked with creating a Mermaid mindmap visualization. You must follow these rules exactly:

1. Start with \`\`\`mermaid followed by a newline
2. The next line must be exactly: mindmap
3. Use only ASCII characters (no Unicode or special characters)
4. Use proper indentation with spaces (2 spaces per level)
5. Root node must use (( )) notation
6. Follow this exact structure:

\`\`\`mermaid
mindmap
  root((Main Topic))
    Topic1
      Subtopic1
      Subtopic2
    Topic2
      Subtopic3
      Subtopic4
\`\`\`

Create a mindmap that shows this expert's analysis process, key findings, and relationship to the final answer.
ONLY output the mermaid code block, nothing else.`;

  const userMessage = `
Expert: ${expert.title} (${expert.specialty})
Background: ${expert.background}

Question Asked: ${question}

Expert's Q&A Process:
${questionsAndAnswers.map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`).join('\n\n')}

Expert's Summary: ${expert.summary}

Final Answer: ${finalAnswer}

Remember:
1. Use the expert's title as the root node
2. Branch out into their key findings
3. Show how their analysis connects to the final answer
4. Keep text concise and clear
5. Use only ASCII characters`;

  try {
    const response = await callOpenAI(systemPrompt, userMessage);
    return extractMermaidCode(response);
  } catch (error) {
    console.error(`Failed to generate mindmap for ${expert.title}:`, error);
    return null;
  }
}

// Generate final answer
async function generateFinalAnswer(question, expertsData) {
  showLoading("Synthesizing final answer...");

  const systemPrompt = `
    You are an assistant tasked with synthesizing expert insights into a comprehensive answer.
    Consider the full conversation history when formulating your response, as the current question
    may relate to or build upon previous exchanges.
    
    Your response should:
    1. Address the current question directly
    2. Reference relevant points from previous conversation
    3. Integrate expert insights and document evidence
    4. Maintain consistency with previous answers
    5. Clarify any relationships with previous topics discussed
  `;

  const conversationContext = getConversationContext();
  const userMessage = `
    Current Question: ${question}

    Previous Conversation:
    ${conversationContext}

    Expert Insights:
    ${expertsData
      .map(
        (expert) => `
        Expert: ${expert.title} (${expert.specialty})
        Background: ${expert.background}
        Key Questions and Answers:
        ${expert.questionsAndAnswers
          .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
          .join("\n")}
        Summary: ${expert.summary}
      `
      )
      .join("\n\n")}

    Document Context:
    ${extractedData.pdfs.map(pdf => `PDF: ${pdf.filename}\nContent: ${pdf.content}`).join('\n\n')}
    ${extractedData.excel.map(excel => `Excel: ${excel.filename}\nContent: ${JSON.stringify(excel.content)}`).join('\n\n')}
    ${extractedData.csv.map(csv => `CSV: ${csv.filename}\nContent: ${JSON.stringify(csv.content)}`).join('\n\n')}
    ${extractedData.docx.map(docx => `DOCX: ${docx.filename}\nContent: ${docx.content}`).join('\n\n')}
  `;

  try {
    return await callOpenAI(systemPrompt, userMessage);
  } catch (error) {
    throw new Error(`Failed to generate final answer: ${error.message}`);
  }
}

// Store extracted data from files
let extractedData = {
  pdfs: [],
  excel: [],
  csv: [],
  docx: [],
};

// Add message to conversation history
function addToHistory(question, answer, isUser = true) {
  conversationHistory.push({
    role: isUser ? "user" : "assistant",
    content: isUser ? question : answer
  });
}

// Get formatted conversation history for LLM context
function getConversationContext() {
  return conversationHistory
    .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n');
}

// Function to convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = (error) => reject(error);
  });
}

// Function to extract text from PDF using Gemini
async function extractPdfData(file) {
  try {
    const base64Data = await fileToBase64(file);
    const response = await fetch(
      "GEMINI API URL",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          contents: [
            {
              system_instruction: {
                parts: [
                  {
                    text: `Extract the text content from the provided PDF.
              `,
                  },
                ],
              },
              parts: [
                {
                  inlineData: {
                    mimeType: "application/pdf",
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("Error extracting PDF:", error);
    throw new Error(`Failed to extract PDF data: ${error.message}`);
  }
}

// Function to extract data from Excel files
async function extractExcelData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}

// Function to extract data from CSV files
async function extractCsvData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const rows = text.split("\n");
        const headers = rows[0].split(",").map((header) => header.trim());
        const jsonData = rows.slice(1).map((row) => {
          const values = row.split(",").map((value) => value.trim());
          return headers.reduce((obj, header, index) => {
            obj[header] = values[index];
            return obj;
          }, {});
        });
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsText(file);
  });
}

// Function to extract data from DOCX files
async function extractDocxData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const result = await mammoth.extractRawText({ arrayBuffer });
        resolve(result.value);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}

// Main function to process uploaded files
async function processFiles(files) {
  try {
    for (const file of files) {
      const extension = file.name.split(".").pop().toLowerCase();

      switch (extension) {
        case "pdf":
          const pdfText = await extractPdfData(file);
          extractedData.pdfs.push({
            filename: file.name,
            content: pdfText,
          });
          break;

        case "xlsx":
        case "xls":
          const excelData = await extractExcelData(file);
          extractedData.excel.push({
            filename: file.name,
            content: excelData,
          });
          break;

        case "csv":
          const csvData = await extractCsvData(file);
          extractedData.csv.push({
            filename: file.name,
            content: csvData,
          });
          break;

        case "docx":
          const docxText = await extractDocxData(file);
          extractedData.docx.push({
            filename: file.name,
            content: docxText,
          });
          break;
      }
    }

    console.log("Extracted data:", extractedData);
    return extractedData;
  } catch (error) {
    console.error("Error processing files:", error);
    throw new Error(`Failed to process files: ${error.message}`);
  }
}

// Update file list UI
function updateFileList(files) {
  fileList.innerHTML = "";
  Array.from(files).forEach(file => {
    const li = document.createElement("li");
    li.className = "file-item";
    
    const extension = file.name.split(".").pop().toLowerCase();
    let iconClass = "bi-file-earmark";
    switch(extension) {
      case "pdf": iconClass = "bi-file-earmark-pdf"; break;
      case "xlsx":
      case "xls": iconClass = "bi-file-earmark-spreadsheet"; break;
      case "csv": iconClass = "bi-file-earmark-text"; break;
      case "docx": iconClass = "bi-file-earmark-word"; break;
    }
    
    li.innerHTML = `
      <i class="bi ${iconClass} file-icon text-primary"></i>
      <span class="flex-grow-1">${file.name}</span>
    `;
    fileList.appendChild(li);
  });
}

// Enable/disable chat input
function toggleChatInput(enabled) {
  questionInput.disabled = !enabled;
  questionForm.querySelector("button").disabled = !enabled;
}

// Handle file upload
fileInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files);
  if (files.length > 0) {
    fileName.textContent = `${files.length} file(s) selected`;
    fileInfo.classList.remove("hidden");
    updateFileList(files);
    
    try {
      await processFiles(files);
      toggleChatInput(true); // Enable chat input after files are processed
    } catch (error) {
      showError(error.message);
    }
  }
});

// Function to add a message to the chat
function addChatMessage(message, isUser = false) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${isUser ? "user-message" : "assistant-message"}`;
  
  const messageContent = document.createElement("div");
  messageContent.className = "message-content";
  messageContent.textContent = message;
  
  messageDiv.appendChild(messageContent);
  chatContainer.appendChild(messageDiv);
  
  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Function to add an analysis result
async function addAnalysisResult(finalAnswer, expertsData, isFollowUp = false) {
  // Add the final answer as an assistant message
  addChatMessage(finalAnswer);
  
  if (!isFollowUp) {
    // Clear and update expert cards only for new questions
    expertsContainer.innerHTML = "";
    mindmapsContainer.innerHTML = "";
    
    // Render expert analysis
    expertsData.forEach((expert, idx) => {
      const expertDiv = document.createElement("div");
      expertDiv.className = "expert-card";
      expertDiv.innerHTML = `
        <div class="card h-100">
          <div class="card-body">
            <div class="d-flex align-items-center mb-3">
              <div class="expert-avatar me-3">
                <i class="bi bi-person-fill"></i>
              </div>
              <div>
                <h5 class="card-title mb-1">${expert.title}</h5>
                <p class="card-subtitle text-muted">${expert.specialty}</p>
              </div>
            </div>
            <p class="card-text"><strong>Background:</strong> ${expert.background}</p>
            <div class="question-section">
              ${expert.questionsAndAnswers.map((qa, i) => `
                <div class="mb-2">
                  <strong>Q${i + 1}:</strong> ${qa.question}<br>
                  <strong>A${i + 1}:</strong> ${qa.answer}
                </div>
              `).join('')}
            </div>
            <p class="mt-3"><strong>Summary:</strong> ${expert.summary}</p>
          </div>
        </div>
      `;
      expertsContainer.appendChild(expertDiv);
    });
  }

  // Always update mindmaps for both new questions and follow-ups
  mindmapsContainer.innerHTML = "";
  
  // Filter out experts with invalid mindmaps and render only valid ones
  const validMindmaps = expertsData.filter(expert => {
    const isValid = expert.mermaid && expert.mermaid.trim().startsWith('mindmap');
    if (!isValid) {
      console.warn('Invalid mindmap for expert:', expert.title, expert.mermaid);
    }
    return isValid;
  });
  
  console.log('Valid mindmaps:', validMindmaps.length);
  
  if (validMindmaps.length === 0) {
    const noMindmapDiv = document.createElement("div");
    noMindmapDiv.className = "alert alert-warning";
    noMindmapDiv.innerHTML = "No valid mindmaps available for visualization.";
    mindmapsContainer.appendChild(noMindmapDiv);
  } else {
    validMindmaps.forEach((expert, idx) => {
      try {
        const mindmapId = `mindmap-${idx}`;
        const mindmapDiv = document.createElement("div");
        mindmapDiv.className = "card mindmap-card mb-3";
        mindmapDiv.innerHTML = `
          <div class="card-body">
            <h6 class="card-title mb-3">${expert.title}'s Perspective</h6>
            <div class="mermaid" id="${mindmapId}">
${expert.mermaid}
            </div>
          </div>
        `;
        mindmapsContainer.appendChild(mindmapDiv);
        
        console.log(`Rendering mindmap for ${expert.title}:`, expert.mermaid);
      } catch (error) {
        console.error(`Error creating mindmap div for expert ${expert.title}:`, error);
      }
    });

    // Re-initialize mermaid for new diagrams with error handling
    try {
      setTimeout(() => {
        console.log('Initializing Mermaid...');
        mermaid.init(
          { 
            startOnLoad: true,
            securityLevel: 'loose',
            theme: 'default',
            flowchart: {
              useMaxWidth: false
            }
          },
          '.mermaid'
        ).then(() => {
          console.log('Mermaid initialization successful');
        }).catch(error => {
          console.error('Mermaid initialization failed:', error);
        });
      }, 500);
    } catch (error) {
      console.error('Error in mermaid initialization:', error);
    }
  }
  
  // Generate and add follow-up questions
  const followUpQuestions = await generateFollowUpQuestions(
    conversationHistory[conversationHistory.length - 2].content,
    finalAnswer
  );
  addFollowUpQuestions(followUpQuestions);
}

// Generate follow-up questions based on the conversation
async function generateFollowUpQuestions(question, finalAnswer) {
  const systemPrompt = `
    You are an assistant tasked with generating 3 relevant follow-up questions based on the current conversation.
    The questions should:
    1. Build upon the current discussion
    2. Explore interesting angles not yet covered
    3. Dive deeper into specific aspects mentioned
    4. Be clear and concise
    5. Be diverse in their focus

    Return exactly 3 questions in JSON format:
    {
      "questions": [
        {
          "text": "Question text here",
          "context": "Brief explanation of why this is a relevant follow-up"
        },
        {...},
        {...}
      ]
    }
  `;

  const conversationContext = getConversationContext();
  const userMessage = `
    Current Question: ${question}
    Final Answer: ${finalAnswer}

    Previous Conversation:
    ${conversationContext}
  `;

  try {
    const response = await callOpenAI(systemPrompt, userMessage);
    return JSON.parse(response).questions;
  } catch (error) {
    console.error("Failed to generate follow-up questions:", error);
    return [];
  }
}

// Add follow-up questions to the UI
function addFollowUpQuestions(questions) {
  followupContainer.innerHTML = "";
  questions.forEach((q, index) => {
    const questionDiv = document.createElement("div");
    questionDiv.className = "followup-question";
    questionDiv.innerHTML = `
      <i class="bi bi-arrow-right-circle me-2"></i>
      ${q.text}
    `;
    questionDiv.addEventListener("click", () => {
      questionInput.value = "";
      processQuestion(q.text, true); // Pass true to indicate it's a follow-up
    });
    followupContainer.appendChild(questionDiv);
  });
}

questionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = questionInput.value.trim();
  questionInput.value = "";
  if (!question) return;
  processQuestion(question, false); // Pass false to indicate it's a new question
});

// Process the question
async function processQuestion(question, isFollowUp = false) {
  try {
    // Add user's question to chat and history
    addChatMessage(question, true);
    addToHistory(question, null, true);
    
    // Show loading state
    showLoading("Processing your question...");
    
    let expertsData;
    if (!isFollowUp) {
      // Get new experts only if it's not a follow-up
      const experts = await getExperts(question);
      expertsData = [];
      
      // Process each expert
      for (const [i, expert] of experts.entries()) {
        expert.name = expert.name || `Expert ${i + 1}`;
        const expertQuestions = await generateExpertQuestions(question, expert);
        const expertAnswers = await getExpertAnswers(question, expert, expertQuestions);
        const questionsAndAnswers = expertQuestions.map((q, idx) => ({
          question: q,
          answer: expertAnswers[idx],
        }));
        const summary = await generateExpertSummary(question, expert, questionsAndAnswers);
        expertsData.push({
          ...expert,
          questions: expertQuestions,
          answers: expertAnswers,
          summary,
          questionsAndAnswers,
        });
      }
      // Store current experts for follow-ups
      currentExpertsData = expertsData;
    } else {
      // Use existing experts for follow-up
      expertsData = currentExpertsData;
      
      // Update each expert's analysis for the follow-up
      for (const expert of expertsData) {
        const expertQuestions = await generateExpertQuestions(question, expert);
        const expertAnswers = await getExpertAnswers(question, expert, expertQuestions);
        const questionsAndAnswers = expertQuestions.map((q, idx) => ({
          question: q,
          answer: expertAnswers[idx],
        }));
        const summary = await generateExpertSummary(question, expert, questionsAndAnswers);
        
        // Add new Q&A to existing expert data
        expert.questions = [...expert.questions, ...expertQuestions];
        expert.answers = [...expert.answers, ...expertAnswers];
        expert.questionsAndAnswers = [
          ...expert.questionsAndAnswers,
          ...questionsAndAnswers
        ];
        expert.summary = summary; // Update summary with latest context
      }
    }

    // Generate final answer
    const finalAnswer = await generateFinalAnswer(question, expertsData);

    // Add answer to chat and history
    addToHistory(finalAnswer, null, false);

    // For each expert, generate or update mindmap
    for (const expert of expertsData) {
      expert.mermaid = await generateExpertMindmapWithLLM(
        question,
        expert,
        expert.questionsAndAnswers,
        finalAnswer
      );
    }

    // Hide loading and show results
    hideLoading();
    await addAnalysisResult(finalAnswer, expertsData, isFollowUp);
    
  } catch (error) {
    hideLoading();
    showError(error.message);
  }
}

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  flowchart: {
    useMaxWidth: false
  }
});
