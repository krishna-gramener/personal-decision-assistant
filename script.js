import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
const pyodideWorker = new Worker("./pyworker.js", { type: "module" });
const marked = new Marked();

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
const viewAllDataBtn = document.getElementById("viewAllDataBtn");
const viewMindmapBtn = document.getElementById("viewMindmapBtn");

// Global variables
const token_url = "";
const openai_url = "";
const gemini_url =
  "";
const { token: key } = await fetch(token_url, { credentials: "include" }).then(
  (r) => r.json()
);
let currentExpertsData = [];
let sheetData = [];

// Function to get appropriate icon class based on file type
const getFileIcon = (filename) => {
  const icons = {
    xlsx: "spreadsheet text-success",
    xls: "spreadsheet text-success",
    csv: "text text-success",
    pdf: "pdf text-danger",
    doc: "word text-primary",
    docx: "word text-primary",
  };
  return `bi bi-file-earmark-${
    icons[filename.split(".").pop().toLowerCase()] || "text"
  }`;
};

// Store conversation history
let conversationHistory = [];

// Store extracted data from files
let extractedData = {
  pdfs: [],
  excel: [],
  csv: [],
  docx: [],
};

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
    const response = await fetch(openai_url, {
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
    });

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
    ${extractedData.pdfs
      .map((pdf) => `PDF: ${pdf.filename}\nContent: ${pdf.content}`)
      .join("\n\n")}
    ${extractedData.excel
      .map(
        (excel) =>
          `Excel: ${excel.filename}\nContent: ${JSON.stringify(excel.content)}`
      )
      .join("\n\n")}
    ${extractedData.csv
      .map(
        (csv) => `CSV: ${csv.filename}\nContent: ${JSON.stringify(csv.content)}`
      )
      .join("\n\n")}
    ${extractedData.docx
      .map((docx) => `DOCX: ${docx.filename}\nContent: ${docx.content}`)
      .join("\n\n")}
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
    ${extractedData.pdfs
      .map((pdf) => `PDF: ${pdf.filename}\nContent: ${pdf.content}`)
      .join("\n\n")}
    ${extractedData.excel
      .map(
        (excel) =>
          `Excel: ${excel.filename}\nContent: ${JSON.stringify(excel.content)}`
      )
      .join("\n\n")}
    ${extractedData.csv
      .map(
        (csv) => `CSV: ${csv.filename}\nContent: ${JSON.stringify(csv.content)}`
      )
      .join("\n\n")}
    ${extractedData.docx
      .map((docx) => `DOCX: ${docx.filename}\nContent: ${docx.content}`)
      .join("\n\n")}
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
    ${extractedData.pdfs
      .map((pdf) => `PDF: ${pdf.filename}\nContent: ${pdf.content}`)
      .join("\n\n")}
    ${extractedData.excel
      .map(
        (excel) =>
          `Excel: ${excel.filename}\nContent: ${JSON.stringify(excel.content)}`
      )
      .join("\n\n")}
    ${extractedData.csv
      .map(
        (csv) => `CSV: ${csv.filename}\nContent: ${JSON.stringify(csv.content)}`
      )
      .join("\n\n")}
    ${extractedData.docx
      .map((docx) => `DOCX: ${docx.filename}\nContent: ${docx.content}`)
      .join("\n\n")}
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
      console.warn("No mermaid code block found in response");
      return null;
    }
    const code = mermaidMatch[1].trim();
    if (!code.startsWith("mindmap")) {
      console.warn("Invalid mindmap code - does not start with mindmap");
      return null;
    }
    return code;
  } catch (error) {
    console.error("Error extracting mermaid code:", error);
    return null;
  }
}

// Generate expert mindmap using LLM (after final answer)
async function generateExpertMindmapWithLLM(
  question,
  expert,
  questionsAndAnswers,
  finalAnswer
) {
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
${questionsAndAnswers
  .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
  .join("\n\n")}

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
    ${extractedData.pdfs
      .map((pdf) => `PDF: ${pdf.filename}\nContent: ${pdf.content}`)
      .join("\n\n")}
    ${extractedData.excel
      .map(
        (excel) =>
          `Excel: ${excel.filename}\nContent: ${JSON.stringify(excel.content)}`
      )
      .join("\n\n")}
    ${extractedData.csv
      .map(
        (csv) => `CSV: ${csv.filename}\nContent: ${JSON.stringify(csv.content)}`
      )
      .join("\n\n")}
    ${extractedData.docx
      .map((docx) => `DOCX: ${docx.filename}\nContent: ${docx.content}`)
      .join("\n\n")}
  `;

  try {
    return await callOpenAI(systemPrompt, userMessage);
  } catch (error) {
    throw new Error(`Failed to generate final answer: ${error.message}`);
  }
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
    const response = await fetch(gemini_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: "Extract the text content from the provided PDF." }],
        },
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "application/pdf", data: base64Data } },
            ],
          },
        ],
      }),
    });
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("Error extracting PDF:", error);
    throw new Error(`Failed to extract PDF data: ${error.message}`);
  }
}

// Function to extract data from Excel files
async function extractExcelData(file) {
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), {
    type: "array",
  });
  workbook.SheetNames.forEach((sheetName) => {
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
    });
    sheetData.push({ fileName: file.name, sheetName, data: jsonData });
  });
  extractedData.excel.push({ fileName: file.name, content: workbook });
  return workbook;
}

// Function to extract data from CSV files
async function extractCsvData(file) {
  const csvData = await file.text();
  const workbook = XLSX.read(csvData, { type: "string" });
  const sheetName = workbook.SheetNames[0];
  const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
  });
  sheetData.push({ fileName: file.name, sheetName: "Sheet1", data: jsonData });
  extractedData.csv.push({ fileName: file.name, content: jsonData });
  return jsonData;
}

// Function to extract data from DOCX files
async function extractDocxData(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const docxText = result.value;
    return docxText;
  } catch (error) {
    console.error("Error extracting DOCX:", error);
    throw new Error(`Failed to extract DOCX data: ${error.message}`);
  }
}

// Function to handle file upload
async function handleFileUpload(files) {
  showLoading("Processing Files...");
  sheetData = [];
  extractedData = { pdfs: [], excel: [], csv: [], docx: [] };
  try {
    fileList.innerHTML = "";
    let hasSpreadsheetFiles = false;
    for (const file of files) {
      const listItem = document.createElement("li");
      listItem.className = "file-item mb-2 d-flex align-items-center";
      listItem.appendChild(
        Object.assign(document.createElement("i"), {
          className: getFileIcon(file.name),
        })
      );
      listItem.appendChild(
        Object.assign(document.createElement("span"), {
          className: "ms-2 me-auto",
          textContent: file.name,
        })
      );
      fileList.appendChild(listItem);
      const ext = file.name.split(".").pop().toLowerCase();
      try {
        if (["xlsx", "xls"].includes(ext)) {
          await extractExcelData(file);
          hasSpreadsheetFiles = true;
        } else if (ext === "csv") {
          await extractCsvData(file);
          hasSpreadsheetFiles = true;
        } else if (ext === "pdf") {
          const pdfText = await extractPdfData(file);
          extractedData.pdfs.push({ filename: file.name, content: pdfText });
        } else if (ext === "docx") {
          const docxText = await extractDocxData(file);
          extractedData.docx.push({ filename: file.name, content: docxText });
        } else {
          console.warn(`Unsupported file type: ${ext}`);
        }
        listItem.appendChild(
          Object.assign(document.createElement("i"), {
            className: "bi bi-check-circle-fill text-success ms-2",
          })
        );
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        listItem.appendChild(
          Object.assign(document.createElement("i"), {
            className: "bi bi-exclamation-circle-fill text-danger ms-2",
            title: "Error processing file",
          })
        );
      }
    }
    viewAllDataBtn.style.display = hasSpreadsheetFiles
      ? "inline-block"
      : "none";
    fileInfo.classList.remove("hidden");
    fileName.textContent = `${files.length} file(s) uploaded successfully`;
    document.getElementById("questionInput").disabled = false;
    document.querySelector("#questionForm button").disabled = false;
    return extractedData;
  } catch (error) {
    console.error("Error processing files:", error);
    showError("Error processing files. Please try again.");
    throw error;
  }
}

// Update file input event listener
fileInput.addEventListener("change", async (e) => {
  if (e.target.files.length)
    try {
      await handleFileUpload(e.target.files);
      hideLoading();
    } catch (err) {
      showError(err.message);
    }
});

// Function to show all data in modal
async function showAllData() {
  const container = document.getElementById("dataTablesContainer");
  container.innerHTML = "";
  // Group sheets by file name
  const fileGroups = {};
  sheetData.forEach((sheet) => {
    (fileGroups[sheet.fileName] ||= []).push(sheet);
  });
  // Create sections for each file and sheet
  Object.entries(fileGroups).forEach(([fileName, sheets]) => {
    const fileSection = Object.assign(document.createElement("div"), {
      className: "table-section",
    });
    fileSection.appendChild(
      Object.assign(document.createElement("h5"), { textContent: fileName })
    );
    sheets.forEach((sheet) => {
      const sheetSection = Object.assign(document.createElement("div"), {
        className: "mb-4",
      });
      sheetSection.appendChild(
        Object.assign(document.createElement("h6"), {
          className: "mb-3",
          textContent: sheet.sheetName,
        })
      );
      const table = Object.assign(document.createElement("table"), {
        className: "table table-striped table-bordered",
      });
      // Header
      if (sheet.data.length > 0) {
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        sheet.data[0].forEach((header) => {
          headerRow.appendChild(
            Object.assign(document.createElement("th"), {
              textContent: header || "",
            })
          );
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);
      }
      // Body
      const tbody = document.createElement("tbody");
      sheet.data.slice(1).forEach((row) => {
        const tr = document.createElement("tr");
        row.forEach((cell) =>
          tr.appendChild(
            Object.assign(document.createElement("td"), {
              textContent: cell || "",
            })
          )
        );
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      const tableWrapper = Object.assign(document.createElement("div"), {
        className: "table-responsive",
      });
      tableWrapper.appendChild(table);
      sheetSection.appendChild(tableWrapper);
      fileSection.appendChild(sheetSection);
    });
    container.appendChild(fileSection);
  });
  new bootstrap.Modal(document.getElementById("dataTablesModal")).show();
}

// Add event listener for view all data button
document
  .getElementById("viewAllDataBtn")
  .addEventListener("click", showAllData);

// Add message to conversation history
function addToHistory(message, isUser = true) {
  conversationHistory.push({
    role: isUser ? "user" : "assistant",
    content: message,
  });
}

// Get formatted conversation history for LLM context
function getConversationContext() {
  return conversationHistory
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join("\n\n");
}

// Function to add a message to the chat
function addChatMessage(message, isUser = false) {
  const div = Object.assign(document.createElement("div"), {
    className: `chat-message ${isUser ? "user-message" : "assistant-message"}`,
  });
  div.appendChild(
    Object.assign(document.createElement("div"), {
      className: "message-content",
      innerHTML: marked.parse(message),
    })
  );
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function addAnalysisResult(finalAnswer, expertsData, isFollowUp = false) {
  expertsContainer.innerHTML = mindmapsContainer.innerHTML = "";

  // Add thinking animation container
  const thinkingDiv = document.createElement("div");
  thinkingDiv.className = "thinking-animation";
  thinkingDiv.innerHTML = `
    <div class="thinking-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  expertsContainer.appendChild(thinkingDiv);

  // Create container for expert analysis
  const analysisDiv = Object.assign(document.createElement("div"), {
    className: "expert-analysis",
  });
  expertsContainer.appendChild(analysisDiv);

  // Function to simulate typing effect
  const typeText = async (element, text, speed = 10) => {
    let htmlContent = "";
    let textIndex = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "<") {
        let tag = "<";
        i++;
        while (text[i] !== ">") {
          tag += text[i];
          i++;
        }
        tag += text[i]; // Include closing '>'
        htmlContent += tag;
      } else {
        htmlContent += text[i];
        textIndex++;
        element.innerHTML = htmlContent;
        element.style.fontSize = "14px";
        // Scroll into view smoothly as text is typed
        element.scrollIntoView({ behavior: "smooth", block: "end" });
        await new Promise((resolve) => setTimeout(resolve, speed));
      }
    }
  };

  if (expertsData) {
    // Expert analysis case - keep existing expert handling code
    const expertReasoning = expertsData
      .map(
        (expert) =>
          `Based on the complexity of your question, I've selected <strong>${expert.title}</strong> who specializes in <strong>${expert.specialty}</strong>. Their background in <strong>${expert.background}</strong> makes them particularly qualified to provide insights on this matter.`
      )
      .join("\n\n");

    const reasoningDiv = document.createElement("div");
    reasoningDiv.className = "chat-message system-message mb-4";
    analysisDiv.appendChild(reasoningDiv);
    await typeText(reasoningDiv, expertReasoning);

    for (const expert of expertsData) {
      const card = document.createElement("div");
      card.className = "expert-card mb-4";
      analysisDiv.appendChild(card);

      const cardContent = `
        <div class="card">
          <div class="card-body">
            <h5 class="card-title">${expert.title}</h5>
            <h6 class="card-subtitle mb-2 text-muted">${expert.specialty}</h6>
            <p class="card-text"><strong>Background:</strong> ${
              expert.background
            }</p>
            <div class="qa-section">
              ${expert.questionsAndAnswers
                .map(
                  (qa) => `
                <div class="qa-item mb-3">
                  <div class="question"><strong>Q:</strong> ${qa.question}</div>
                  <div class="answer"><strong>A:</strong> ${qa.answer}</div>
                </div>
              `
                )
                .join("")}
            </div>
            <p class="expert-summary mt-3"><strong>Summary:</strong> ${
              expert.summary
            }</p>
          </div>
        </div>
      `;
      await typeText(card, cardContent, 5);
    }
    addChatMessage(finalAnswer);

    if (conversationHistory.length >= 2 && !isFollowUp) {
      const followUpQuestions = await generateFollowUpQuestions(
        conversationHistory[conversationHistory.length - 2].content,
        finalAnswer
      );
      addFollowUpQuestions(followUpQuestions);
    }
  } else {
    // Data analysis case - show code in analysis column and results in chat
    const analysisCard = document.createElement("div");
    analysisCard.className = "expert-card mb-4";
    analysisDiv.appendChild(analysisCard);

    // Extract Python code and add to analysis column
    const codeMatch = finalAnswer.match(/\`\`\`python\n([\s\S]*?)\`\`\`/);
    if (codeMatch) {
      const codeContent = `<div class="card">
        <div class="card-body">
          <pre><code class="language-python">${codeMatch[1]}</code></pre>
        </div>
      </div>`;
      await typeText(analysisCard, codeContent);
    }

    // Extract the formatted analysis (without Python code)
    const formattedContent = finalAnswer
      .replace(/\`\`\`python[\s\S]*?\`\`\`/, "")
      .trim();
    addChatMessage(formattedContent);
    // Generate follow-up questions using only the formatted analysis
    if (conversationHistory.length >= 2 && !isFollowUp) {
      const followUpQuestions = await generateFollowUpQuestions(
        conversationHistory[conversationHistory.length - 2].content,
        formattedContent // Pass only the formatted analysis without Python code
      );
      addFollowUpQuestions(followUpQuestions);
    }
  }

  // Remove thinking animation
  thinkingDiv.remove();
  setupMindmapButton();
}

async function generateFollowUpQuestions(question, finalAnswer) {
  const systemPrompt = `You are an AI assistant helping users analyze data.
  Based on the previous question and answer, suggest 3 relevant follow-up questions.
  
  For data analysis questions:
  - Focus on deeper insights from the data
  - Suggest comparisons between different sheets if multiple sheets exist
  - Ask about trends, patterns, or correlations
  - Consider statistical analysis possibilities
  - Avoid basic questions already answered
  
  For expert analysis questions:
  - Focus on expert perspectives
  - Ask about implications and recommendations
  - Consider different viewpoints
  - Explore practical applications
  
  Return questions in a JSON array format.`;

  const userMessage = `Previous Question: ${question}\n\nAnswer: ${finalAnswer}\n\nGenerate 3 relevant follow-up questions.`;

  try {
    const response = await callOpenAI(systemPrompt, userMessage);
    let questions;
    try {
      questions = JSON.parse(response);
    } catch {
      // If response isn't valid JSON, try to extract array from markdown
      const match = response.match(/\[[\s\S]*\]/);
      questions = match ? JSON.parse(match[0]) : [];
    }

    return questions.slice(0, 3); // Ensure we only return 3 questions
  } catch (error) {
    console.error("Failed to generate follow-up questions:", error);
    return [];
  }
}

// Add follow-up questions to the UI
function addFollowUpQuestions(questions) {
  if (!questions || !questions.length) return;

  followupContainer.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "follow-up-questions mt-4";

  const header = document.createElement("h6");
  header.className = "mb-3";
  header.textContent = "Follow-up Questions:";
  wrapper.appendChild(header);

  const list = document.createElement("div");
  list.className = "d-flex flex-column gap-2";

  questions.forEach((question) => {
    const button = document.createElement("button");
    button.className = "btn btn-outline-primary text-start";
    button.textContent = question;
    button.onclick = () => {
      questionInput.value = question;
      processQuestion(question, true);
    };
    list.appendChild(button);
  });

  wrapper.appendChild(list);
  followupContainer.appendChild(wrapper);
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
    addChatMessage(question, true);
    addToHistory(question, true);
    showLoading("Processing your question...");

    // Check if we have Excel/CSV data and if analysis is needed
    const hasExcelData =
      extractedData.excel.length > 0 || extractedData.csv.length > 0;

    if (hasExcelData) {
      const needsAnalysis = await needsExcelAnalysis(question);
      if (needsAnalysis) {
        showLoading("Performing data analysis...");

        // Prepare data for analysis
        let analysisData;
        let sheetInfo = "";

        if (extractedData.excel.length > 0) {
          const workbook = extractedData.excel[0].content;
          // Get all sheet names and their first few rows
          const sheets = workbook.SheetNames.map((name) =>
            extractSheetData(workbook, name)
          );

          // Create sheet info for LLM context
          sheetInfo = `Available sheets in Excel file:
${sheets
  .map(
    (sheet) => `
Sheet: ${sheet.name}
Columns: ${sheet.headers.join(", ")}
Sample data (first 5 rows):
${JSON.stringify(sheet.data.slice(0, 5), null, 2)}
`
  )
  .join("\n")}`;

          // Store full data for analysis
          analysisData = sheets.reduce((acc, sheet) => {
            acc[sheet.name] = sheet.data;
            return acc;
          }, {});
        } else {
          // For CSV, use existing logic
          const csvContent = extractedData.csv[0].content;
          const headers = csvContent[0];
          analysisData = {
            Sheet1: csvContent
              .slice(1)
              .map((row) =>
                Object.fromEntries(headers.map((header, i) => [header, row[i]]))
              ),
          };
          sheetInfo = `CSV Data:
Columns: ${headers.join(", ")}
Sample data (first 5 rows):
${JSON.stringify(analysisData.Sheet1.slice(0, 5), null, 2)}`;
        }

        const pythonCode = await generatePythonAnalysisCode(question, {
          sheetInfo,
        });

        try {
          const analysisResult = await new Promise((resolve, reject) => {
            const id = Date.now().toString();
            const handler = (e) => {
              if (e.data.id === id) {
                pyodideWorker.removeEventListener("message", handler);
                e.data.error
                  ? reject(new Error(e.data.error))
                  : resolve(e.data.result);
              }
            };
            pyodideWorker.addEventListener("message", handler);
            pyodideWorker.postMessage({
              id,
              code: pythonCode,
              data: analysisData,
              context: {},
            });
          });

          showLoading("Formatting analysis results...");

          // Format the results using LLM
          const formattedAnalysis = await formatAnalysisResult(
            analysisResult,
            question
          );

          const formattedResult = `
\`\`\`python
${pythonCode}
\`\`\`

${formattedAnalysis}`;

          addToHistory(formattedAnalysis, false);
          await addAnalysisResult(formattedResult, null, isFollowUp);
          hideLoading();
          //follow up need to be added here
          return;
        } catch (error) {
          console.error("Analysis failed:", error);
          hideLoading();
          const errorMessage =
            "Sorry, there was an error analyzing the data: " + error.message;
          addChatMessage(errorMessage, false);
          addToHistory(errorMessage, false);
          return;
        }
      }
    }
    // Regular expert consultation flow if no Excel analysis needed
    let expertsData = !isFollowUp ? [] : currentExpertsData;
    if (!isFollowUp) {
      const experts = await getExperts(question);
      for (const [i, expert] of experts.entries()) {
        expert.name ||= `Expert ${i + 1}`;
        const qs = await generateExpertQuestions(question, expert);
        const as = await getExpertAnswers(question, expert, qs);
        const qa = qs.map((q, idx) => ({ question: q, answer: as[idx] }));
        const summary = await generateExpertSummary(question, expert, qa);
        expertsData.push({
          ...expert,
          questions: qs,
          answers: as,
          summary,
          questionsAndAnswers: qa,
        });
      }
      currentExpertsData = expertsData;
    } else {
      for (const expert of expertsData) {
        const qs = await generateExpertQuestions(question, expert);
        const as = await getExpertAnswers(question, expert, qs);
        const qa = qs.map((q, idx) => ({ question: q, answer: as[idx] }));
        expert.questions = [...expert.questions, ...qs];
        expert.answers = [...expert.answers, ...as];
        expert.questionsAndAnswers = [...expert.questionsAndAnswers, ...qa];
        expert.summary = await generateExpertSummary(
          question,
          expert,
          expert.questionsAndAnswers
        );
      }
    }
    const finalAnswer = await generateFinalAnswer(question, expertsData);
    addToHistory(finalAnswer, false);
    for (const expert of expertsData) {
      expert.mermaid = await generateExpertMindmapWithLLM(
        question,
        expert,
        expert.questionsAndAnswers,
        finalAnswer
      );
    }
    hideLoading();
    await addAnalysisResult(finalAnswer, expertsData, isFollowUp);
  } catch (error) {
    hideLoading();
    showError(error.message);
  }
}

// Function to show mindmap button and setup click handler
function setupMindmapButton() {
  viewMindmapBtn.classList.remove("d-none");
  viewMindmapBtn.addEventListener("click", () => {
    const mindmapSection = document.querySelector(".mindmap-section");
    mindmapSection.scrollIntoView({ behavior: "smooth", block: "start" });
    // viewMindmapBtn.href=".mindmap-section"
  });
}

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  flowchart: {
    useMaxWidth: false,
  },
});

// Function to check if question needs Excel analysis
async function needsExcelAnalysis(question) {
  const systemPrompt = `You are an assistant that determines if a question requires Excel/CSV data analysis.
  Answer with ONLY "yes" or "no". Consider if the question involves:
  - Data calculations
  - Statistical analysis
  - Data filtering or grouping
  - Numerical comparisons
  - Trend analysis
  - Data aggregation`;

  const userMessage = `Question: ${question}
  Does this question require Excel/CSV data analysis? Answer only yes/no.`;

  try {
    const response = await callOpenAI(systemPrompt, userMessage);
    return response.toLowerCase().includes("yes");
  } catch (error) {
    console.error("Failed to check if analysis needed:", error);
    return false;
  }
}

// Function to generate Python code for Excel analysis
async function generatePythonAnalysisCode(question, data) {
  const systemPrompt = `You are a Python code generator specialized in data analysis.
  Generate a Python function that analyzes data using pandas and numpy.
  The function should:
  1. Be named 'generateAnalysis'
  2. Take a dictionary of pandas DataFrames as input parameter, where each key is a sheet name
  3. Return a dictionary with analysis results (must be JSON-serializable)
  4. Include type hints for parameters and return type
  5. Include clear docstring and comments
  6. Include proper error handling inside the function
  7. Make sure to handle NAN/NA Values properly
  Function template to follow:
  \`\`\`python
  import pandas as pd
  import numpy as np
  import scipy.stats as stats
  from typing import Dict
  
  def generateAnalysis(dfs: Dict[str, pd.DataFrame]) -> dict:
      """
      Analyze the provided DataFrames based on the question.
      
      Args:
          dfs (Dict[str, pd.DataFrame]): Dictionary of DataFrames, where key is sheet name
          
      Returns:
          dict: Analysis results as a JSON-serializable dictionary
              All numpy/pandas numeric types must be converted to Python native types
              Example: {'sheet1_mean': float(dfs['Sheet1']['column'].mean())}
      """
      try:
          # Your analysis code here
          result = {}  # Dictionary with native Python types
          return result
      except Exception as e:
          return {"error": str(e)}
  \`\`\`
  
  Here is the dataset structure:
  ${data.sheetInfo}`;

  const userMessage = `Question: ${question}
  Generate the generateAnalysis function to analyze this data.
  IMPORTANT:
  1. Follow the exact function template
  2. Convert all numpy/pandas numeric types to native Python types using float(), int()
  3. Return only JSON-serializable values in the dictionary
  4. Handle all errors inside the function
  5. Make sure to handle multiple sheets appropriately`;

  try {
    const response = await callOpenAI(systemPrompt, userMessage);
    const codeMatch = response.match(/```python\n([\s\S]*?)```/);
    let pythonCode = codeMatch ? codeMatch[1].trim() : response.trim();

    // Ensure all required imports are present
    const requiredImports = [
      "import pandas as pd",
      "import numpy as np",
      "import scipy.stats as stats",
      "from typing import Dict",
    ];

    const missingImports = requiredImports.filter(
      (imp) => !pythonCode.includes(imp)
    );
    if (missingImports.length > 0) {
      pythonCode = missingImports.join("\n") + "\n\n" + pythonCode;
    }

    // Add the function call
    pythonCode += "\n\n# Convert input data to DataFrames\n";
    pythonCode +=
      "sheet_dfs = {name: pd.DataFrame(data) for name, data in data.items()}\n";
    pythonCode += "# Execute analysis\ngenerateAnalysis(sheet_dfs)";
    return pythonCode;
  } catch (error) {
    console.error("Failed to generate Python code:", error);
    throw error;
  }
}

// Function to extract data from Excel/CSV files
function extractSheetData(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: "A",
    raw: true,
    blankrows: false,
  });
  const headers = Object.values(rows[0]);
  return {
    name: sheetName,
    headers,
    data: rows
      .slice(1)
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([_, v], i) => [headers[i], v])
        )
      ),
  };
}

// Function to format analysis results using LLM
async function formatAnalysisResult(analysisResult, question) {
  const systemPrompt = `You are a data analysis formatter that converts JSON analysis results into clear, readable markdown format.
  Your task is to explain the analysis results in the context of the user's question.
  
  Guidelines:
  1. Start with a brief restatement of the user's question
  2. Create clear section headers for each metric/analysis
  3. Format numbers with appropriate precision
  4. Use bullet points for lists
  5. Create tables when appropriate
  6. Add brief explanations for the results that directly address the user's question
  7. Highlight important findings
  8. Use proper markdown formatting
  9. End with a concise conclusion that answers the original question
  
  Example format:
  
  ### Summary
  Brief explanation of how the analysis answers the question.
  
  ### Key Findings
  * Finding 1: [value] - explanation
  * Finding 2: [value] - explanation
  
  ### Detailed Results
  [Relevant metrics and explanations]
  
  ### Conclusion
  Direct answer to the user's question based on the analysis.`;

  const userMessage = `User Question: "${question}"

Analysis Results:
${JSON.stringify(analysisResult, null, 2)}

Please format these results in a clear markdown format that directly addresses the user's question.`;

  try {
    const formattedResponse = await callOpenAI(systemPrompt, userMessage);
    return formattedResponse;
  } catch (error) {
    console.error("Failed to format analysis result:", error);
    // Fallback to basic formatting if LLM fails
    return `## Analysis Results for: "${question}"\n${JSON.stringify(
      analysisResult,
      null,
      2
    )}`;
  }
}
