import { callOpenAI,showError,generateRelatedQuestion,processQuestion } from './script.js';

// Store DOM elements and state
let elements = {
    container: null,
    viewMindmapBtn: null,
    mindmapModal: null
};

// Store current mindmap data and question
let currentFinalmapData = null;
let currentQuestion = null;

// Function to update current question
function updateCurrentQuestion(question) {
    currentQuestion = question;
}

// Function to update mindmap data
function updateMindmapData(data) {
    currentFinalmapData = data;
    if (data && elements.viewMindmapBtn) {
        elements.viewMindmapBtn.classList.remove('d-none');
    }
}

// Initialize mindmap handlers with DOM elements
function initializeMindmap(domElements) {
    elements = {
        container: domElements.container,
        viewMindmapBtn: domElements.viewMindmapBtn,
        mindmapModal: domElements.mindmapModal
    };

    // Initially hide the mindmap button
    elements.viewMindmapBtn.classList.add('d-none');

    // Set up event listeners
    elements.container.addEventListener('dblclick', handleContainerClick);
    elements.viewMindmapBtn.addEventListener("click", handleViewFinalmap);
}

// Function to generate mindmap data for jsMind
async function generateFinalmapData(question, expertsData) {
    const systemPrompt = `You are an expert at creating cumulative mindmaps. Given a question and multiple experts' analyses, 
    create a hierarchical mindmap structure that combines insights from all experts. The structure should be in jsMind format.
    Direction should always be right.

    Return a JSON object in this exact format:
    {
        "meta": {
            "name": "Question Summary",
            "author": "AI Assistant",
            "version": "1.0"
        },
        "format": "node_tree",
        "data": {
            "id": "root",
            "topic": "Main Question",
            "children": [...]
        }
    }`;

    const context = `
        Question: ${question}
        
        Expert Analyses:
        ${expertsData
            .map(
                (expert) => `${expert.name}:
                Questions Asked: ${expert.questions.join(", ")}
                Final Answer: ${expert.finalAnswer}`
            )
            .join("\n\n")}
    `;

    try {
        const response = await callOpenAI(systemPrompt, context);
        return JSON.parse(response);
    } catch (error) {
        console.error('Error generating mindmap data:', error);
        throw new Error('Failed to generate mindmap visualization');
    }
}

// Function to render mindmap using jsMind
function renderFinalmap(mindmapData) {
    const options = {
        container: 'jsmind_container',
        theme: 'primary',
        editable: false,
        support_html: true,
        view: {
            draggable: true,
            hide_scrollbars_when_mouse_out: true
        },
        layout: {
            hspace: 120,
            vspace: 30,
            pspace: 13
        }
    };

    // Show modal first
    const mindmapModal = new bootstrap.Modal(elements.mindmapModal);
    mindmapModal.show();

    // Create and show mindmap after modal is shown
    const showMindmap = () => {
        // Clear the container first
        elements.container.innerHTML = '';

        // Initialize jsMind
        const jm = new jsMind(options);
        
        // Show mindmap data
        try {
            jm.show(mindmapData);
            
            // Force resize after a short delay
            setTimeout(() => {
                if (jm && typeof jm.resize === 'function') {
                    jm.resize();
                }
            }, 200);
        } catch (error) {
            console.error('Error showing mindmap:', error);
            showError('Failed to render mindmap');
        }

        // Remove the event listener
        elements.mindmapModal.removeEventListener('shown.bs.modal', showMindmap);
    };

    // Add the event listener
    elements.mindmapModal.addEventListener('shown.bs.modal', showMindmap);
}

// Function to handle view mindmap button click
function handleViewFinalmap() {
    if (currentFinalmapData) {
        renderFinalmap(currentFinalmapData);
    }
}

// Generate expert mindmap using LLM (after final answer)
// Generate expert mindmap using LLM (after final answer)
async function generateExpertMindmapWithLLM(
    question,
    expert,
    questionsAndAnswers,
    finalAnswer
  ) {
    const systemPrompt = `
  You are an assistant tasked with creating a Mermaid mindmap visualization. Follow these rules precisely:
  
  1. Format:
     - First line: \`\`\`mermaid
     - Second line: mindmap
     - Use 2 spaces for each indentation level
     - Root node: (( )) notation
     - Child nodes: plain text without special formatting
  
  2. Content Rules:
     - Use only alphanumeric characters and basic punctuation
     - Avoid hyphens (-) at start of lines
     - Keep node text concise (max 40 characters)
     - No special characters or Unicode
     - No HTML or markdown
  
  Example Structure:
  \`\`\`mermaid
  mindmap
    root((Expert Analysis))
      Finding 1
        Detail A
        Detail B
      Finding 2
        Detail C
  \`\`\`
  
  Create a focused mindmap showing the expert's key findings and their connection to the final answer.
  ONLY output the mermaid code block, nothing else.`;
  
    const userMessage = `
  Context:
  Expert: ${expert.title}
  Specialty: ${expert.specialty}
  Question: ${question}
  
  Analysis:
  ${questionsAndAnswers
    .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
    .join("\n\n")}
  
  Summary: ${expert.summary}
  Conclusion: ${finalAnswer}
  
  Guidelines:
  1. Root: Expert's role as central node
  2. Level 1: Key findings/themes
  3. Level 2: Supporting evidence
  4. Level 3: Connection to final answer`;
  
    try {
      const response = await callOpenAI(systemPrompt, userMessage);
      return extractMermaidCode(response);
    } catch (error) {
      console.error(`Failed to generate mindmap for ${expert.title}:`, error);
      return null;
    }
  }

// Function to handle container click for related questions
function handleContainerClick(e) {
    if (e.target.tagName === 'JMNODE') {
        const nodeText = e.target.textContent;

        if(!nodeText) {
            console.error('No node text available');
            return;
        }

        if (!currentQuestion) {
            showError('No current question context available');
            return;
        }

        generateRelatedQuestion(nodeText, currentQuestion)
            .then(question => {
                if (question) {
                    processQuestion(question, false);
                }
            })
            .catch(error => {
                showError(error.message);
            });
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
  
export {
    initializeMindmap,
    generateFinalmapData,
    generateExpertMindmapWithLLM,
    updateMindmapData,
    updateCurrentQuestion
};