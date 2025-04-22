// DOM Elements
const questionForm = document.getElementById("questionForm");
const questionInput = document.getElementById("questionInput");
const loadingSpinner = document.getElementById("loadingSpinner");
const loadingMessage = document.getElementById("loadingMessage");
const errorAlert = document.getElementById("errorAlert");
const errorMessage = document.getElementById("errorMessage");
const resultsContainer = document.getElementById("resultsContainer");
const originalQuestionElement = document.getElementById("originalQuestion");
const expertsContainer = document.getElementById("expertsContainer");
const finalAnswerElement = document.getElementById("finalAnswer");
const mindmapsContainer = document.getElementById("mindmapsContainer");
let key = "";

// Hide main content until API is set
window.addEventListener("DOMContentLoaded", () => {
  // Check for saved API key in localStorage (with expiry)
  const apiTokenData = localStorage.getItem("apiToken");
  if (apiTokenData) {
    try {
      const { token, expiry } = JSON.parse(apiTokenData);
      const now = Date.now();
      if (expiry && now < expiry) {
        key = token;
        apiBox.classList.add("d-none");
        document.getElementById("resultsContainer").style.display = "";
        document.getElementById("questionForm").style.display = "";
        document.getElementById("mindmapsContainer").style.display = "";
      } else {
        // Expired, remove from storage
        localStorage.removeItem("apiToken");
        document.getElementById("resultsContainer").style.display = "none";
        document.getElementById("questionForm").style.display = "none";
        document.getElementById("mindmapsContainer").style.display = "none";
      }
    } catch {
      // Fallback: clear invalid data
      localStorage.removeItem("apiToken");
      document.getElementById("resultsContainer").style.display = "none";
      document.getElementById("questionForm").style.display = "none";
      document.getElementById("mindmapsContainer").style.display = "none";
    }
  } else {
    document.getElementById("resultsContainer").style.display = "none";
    document.getElementById("questionForm").style.display = "none";
    document.getElementById("mindmapsContainer").style.display = "none";
  }
});

const apiBox = document.getElementById("apiBox");
const apiForm = document.getElementById("apiForm");
const apiInput = document.getElementById("apiInput");

apiForm.addEventListener("submit", function(e) {
  e.preventDefault();
  key = apiInput.value.trim();
  if (!key) return;
  // Set expiry to 1 day from now
  const expiry = Date.now() + 24 * 60 * 60 * 1000;
  localStorage.setItem("apiToken", JSON.stringify({ token: key, expiry }));
  // Hide API box, show main content
  apiBox.classList.add("d-none");
  document.getElementById("resultsContainer").style.display = "";
  document.getElementById("questionForm").style.display = "";
  document.getElementById("mindmapsContainer").style.display = "";
});

// Show loading state
function showLoading(message) {
  loadingMessage.textContent = message;
  loadingSpinner.classList.remove("hidden");
  resultsContainer.classList.add("hidden");
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
      "https://aipipe.org/openrouter/v1/chat/completions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-4.1-nano",
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
    on a specific question. For the given question, suggest 3 distinct experts who would
    have valuable perspectives on the topic. Each expert should have different specialties
    and backgrounds to ensure diverse insights.

    Provide your response in JSON format with the following structure:
    {
      "experts": [
        {
          "title": "Expert's title/profession",
          "specialty": "Expert's area of expertise",
          "background": "Brief 1-2 sentence background on why this expert is relevant and what they bring to the table with respect to the question"
        },
        {...},
        {...}
      ]
    }
  `;

  try {
    const response = await callOpenAI(systemPrompt, question);
    return JSON.parse(response).experts;
  } catch (error) {
    throw new Error(`Failed to identify experts: ${error.message}`);
  }
}

// Generate questions for each expert
async function generateExpertQuestions(question, expert) {
  const systemPrompt = `
    You are an assistant tasked with generating 3 insightful questions related to the user's
    main question. These questions should be specialized for ${expert.name}, a ${expert.title}
    with expertise in ${expert.specialty}.

    Generate questions that leverage this expert's unique perspective and knowledge. Each
    question should help address different aspects of the main question.

    Provide your response in JSON format:
    {
      "questions": [
        "First specialized question for the expert",
        "Second specialized question for the expert",
        "Third specialized question for the expert"
      ]
    }
  `;

  try {
    const response = await callOpenAI(systemPrompt, question);
    return JSON.parse(response).questions;
  } catch (error) {
    throw new Error(
      `Failed to generate questions for ${expert.name}: ${error.message}`
    );
  }
}

// Get expert answers
async function getExpertAnswers(question, expert, expertQuestions) {
  const systemPrompt = `
    You are ${expert.name}, a ${expert.title} with expertise in ${expert.specialty}.
    ${expert.background}

    Please provide your expert answers to the following questions based on your
    specialized knowledge and perspective. Be insightful and specific, drawing
    on your expertise.

    Format your response as JSON:
    {
      "answers": [
        "Answer to first question",
        "Answer to second question",
        "Answer to third question"
      ]
    }
  `;

  const userMessage = `
    Main topic: ${question}

    Questions:
    1. ${expertQuestions[0]}
    2. ${expertQuestions[1]}
    3. ${expertQuestions[2]}
  `;

  try {
    const response = await callOpenAI(systemPrompt, userMessage);
    return JSON.parse(response).answers;
  } catch (error) {
    throw new Error(
      `Failed to get answers from ${expert.name}: ${error.message}`
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
  const mermaidMatch = response.match(/```mermaid\s*([\s\S]*?)```/i);
  return mermaidMatch ? mermaidMatch[1].trim() : '';
}

// Generate expert mindmap using LLM (after final answer)
async function generateExpertMindmapWithLLM(question, expert, questionsAndAnswers, finalAnswer) {
  const systemPrompt = `
You are an assistant tasked with visualizing an expert's reasoning process as a mind map.

Given:
- The main question: "${question}"
- The expert's background: "${expert.background}"
- The expert's specialized questions and answers:
${questionsAndAnswers.map((qa, idx) => `  Q${idx+1}: ${qa.question}\n  A${idx+1}: ${qa.answer}`).join('\n')}
- The final answer synthesized from all experts: "${finalAnswer}"

Create a Mermaid Mindmap (inside a \`\`\`mermaid code block) that best represents this expert's thinking, their contributions, and their relationship to the final answer. Use your judgment to structure the mindmap for clarity and insight. Only output the Mermaid code block.`;

  const userMessage = '';
  try {
    const response = await callOpenAI(systemPrompt, userMessage);
    return extractMermaidCode(response);
  } catch (error) {
    throw new Error(
      `Failed to generate mindmap for ${expert.name}: ${error.message}`
    );
  }
}

// Generate final answer
async function generateFinalAnswer(question, expertsData) {
  showLoading("Synthesizing final answer...");

  const systemPrompt = `
    You are an assistant tasked with synthesizing insights from multiple experts to provide
    a comprehensive answer to the user's original question.

    Review the summaries from each expert and create a well-structured final answer that:
    1. Integrates the key insights from all experts
    2. Highlights areas of consensus and different perspectives
    3. Directly addresses the original question with depth and nuance
    4. Provides a balanced, holistic response

    Your answer should be 3-5 paragraphs and should feel like a conclusion to a thoughtful
    roundtable discussion among experts.
  `;

  const userMessage = `
    Original question: ${question}

    Expert Summaries:
    ${expertsData
      .map(
        (expert) =>
          `Expert: ${expert.name}, ${expert.title} (${expert.specialty})
       Summary: ${expert.summary}`
      )
      .join("\n\n")}
  `;

  try {
    return await callOpenAI(systemPrompt, userMessage);
  } catch (error) {
    throw new Error(`Failed to generate final answer: ${error.message}`);
  }
}

// Process the question
async function processQuestion(question) {
  try {
    // Get experts
    const experts = await getExperts(question);

    // Process each expert
    const expertsData = [];
    for (const [i, expert] of experts.entries()) {
      expert.name = expert.name || `Expert ${i + 1}`;
      const expertQuestions = await generateExpertQuestions(
        question,
        expert
      );
      const expertAnswers = await getExpertAnswers(
        question,
        expert,
        expertQuestions
      );
      const questionsAndAnswers = expertQuestions.map((q, idx) => ({
        question: q,
        answer: expertAnswers[idx],
      }));
      const summary = await generateExpertSummary(
        question,
        expert,
        questionsAndAnswers
      );
      expertsData.push({
        ...expert,
        questions: expertQuestions,
        answers: expertAnswers,
        summary,
        questionsAndAnswers,
      });
    }

    // Generate final answer
    const finalAnswer = await generateFinalAnswer(question, expertsData);

    // For each expert, generate LLM-based mindmap
    for (const expert of expertsData) {
      expert.mermaid = await generateExpertMindmapWithLLM(
        question,
        expert,
        expert.questionsAndAnswers,
        finalAnswer
      );
    }

    // Display results
    hideLoading();
    resultsContainer.classList.remove("hidden");
    originalQuestionElement.textContent = question;
    expertsContainer.innerHTML = "";
    // Render all mindmaps in the dedicated div
    mindmapsContainer.innerHTML = "";
    expertsData.forEach((expert, idx) => {
      // Render expert info as before
      const expertDiv = document.createElement("div");
      expertDiv.className = "expert-summary";
      expertDiv.innerHTML = `
        <h3>${expert.name}, ${expert.title} (${expert.specialty})</h3>
        <p><strong>Background:</strong> ${expert.background}</p>
        <ul>${expert.questions
          .map(
            (q, idx) =>
              `<li><strong>Q:</strong> ${q}<br/><strong>A:</strong> ${expert.answers[idx]}</li>`
          )
          .join("")}</ul>
        <p><strong>Summary:</strong> ${expert.summary}</p>
      `;
      expertsContainer.appendChild(expertDiv);
      // Render mindmap in the dedicated container
      const mindmapDiv = document.createElement("div");
      mindmapDiv.className = "mermaid mb-3";
      mindmapDiv.id = `mindmap-mermaid-${idx}`;
      mindmapDiv.textContent = expert.mermaid;
      mindmapsContainer.appendChild(mindmapDiv);
      setTimeout(() => {
        if (window.mermaid && expert.mermaid) {
          window.mermaid.init(undefined, `#mindmap-mermaid-${idx}`);
        }
      }, 0);
    });
    finalAnswerElement.textContent = finalAnswer;
  } catch (error) {
    hideLoading();
    showError(error.message);
  }
}

questionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = questionInput.value.trim();
  if (!question) return;
  processQuestion(question);
});
