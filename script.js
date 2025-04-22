import { getProfile } from "https://aipipe.org/aipipe.js";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
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
let key="";
init();

async function init() {
  const { token, email} = getProfile();
  if (!token)
    window.location = `https://aipipe.org/login?redirect=${window.location.href}`;
  key=token;
  console.log(email);
}

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
  console.log(response);
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

async function generateCumulativeMindmapWithLLM(question, expertsData, finalAnswer){

  showLoading("Generating Final Mindmap...");

  const systemPrompt = `
  You are an assistant tasked with visualizing the synthesis of insights from multiple experts.
  
  Your task:
  - Synthesize the mindmaps of all experts into a single, cumulative mindmap.
  - Merge overlapping concepts, show consensus and unique contributions.
  - Preserve the hierarchical structure of the mindmap.
  
  Output:
  - Output ONLY a JSON object with the following format, and nothing else.
  
  Example format:
  {
    "nodes": [
      { "id": "root", "label": "Main Topic", "experts": [1,2,3] },
      { "id": "sub1", "label": "Subtopic", "experts": [1,2] },
      { "id": "sub2", "label": "Another Subtopic", "experts": [2,3] }
      // ... more nodes
    ],
    "edges": [
      { "from": "root", "to": "sub1" },
      { "from": "root", "to": "sub2" }
      // ... more edges
    ]
  }
  
  Guidelines:
  - Each node must have a unique "id", a "label" (the concept text), and an "experts" array (listing which experts contributed to that node, e.g., [1,2]).
  - The "edges" array should define parent-child relationships between nodes using their "id".
  - Keep it concise and not more than 50 nodes
  - Do not include any explanations, comments, or extra text—only the JSON object.
  `;
 
  const userMessage = `
    Question: ${question}
    Final Answer: ${finalAnswer}
    Experts:
    ${expertsData
      .map(
        (expert) =>
          `Expert: ${expert.name}, ${expert.title} (${expert.specialty} \n)
           Expert Mindmap: ${expert.mermaid}\n`
      )
      .join("\n\n")}
  `;

  try {
    const response = await callOpenAI(systemPrompt, userMessage);
    console.log("Final Mindmap response:", response);
    return JSON.parse(response);
  } catch (error) {
    throw new Error(`Failed to generate cumulative mindmap: ${error.message}`);
  }
}

function renderCumulativeMindmap(data) {
  const width = 1500, height = 1000;

  // Clear previous visualization
  d3.select("#cumulative-mindmap").html("");

  const svg = d3.select("#cumulative-mindmap")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Create a map of nodes for quick lookup
  const nodeMap = {};
  data.nodes.forEach(node => nodeMap[node.id] = node);

  // Build a hierarchy for D3 from the flat node list
  function buildHierarchy(rootId) {
    const root = nodeMap[rootId];
    root.children = data.edges
      .filter(e => e.from === rootId)
      .map(e => buildHierarchy(e.to));
    return root;
  }
  const root = d3.hierarchy(buildHierarchy("root"));

  // Create a tree layout
  const tree = d3.tree().size([width - 100, height - 100]);
  const treeData = tree(root);

  // Draw links
  svg.selectAll(".link")
    .data(treeData.links())
    .enter().append("path")
    .attr("class", "link")
    .attr("d", d3.linkHorizontal()
      .x(d => d.y + 50)
      .y(d => d.x + 50))
    .style("fill", "none")
    .style("stroke", "#aaa");

  // Draw nodes
  const node = svg.selectAll(".node")
    .data(treeData.descendants())
    .enter().append("g")
    .attr("class", "node")
    .attr("transform", d => `translate(${d.y + 50},${d.x + 50})`);

  node.append("circle")
    .attr("r", 18)
    .attr("fill", d => {
      // Color nodes based on expert overlap
      if (d.data.experts.length === 3) return "#FFD700"; // all experts
      if (d.data.experts.length === 2) return "#87CEEB";
      return "#90EE90";
    })
    .attr("stroke", "#333");

  node.append("text")
    .attr("dy", 5)
    .attr("x", 25)
    .text(d => d.data.label)
    .style("font-size", "14px");

  // Add tooltip on hover
  node.append("title")
    .text(d => `Experts: ${d.data.experts.join(", ")}`);
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
    console.log("Experts data:", expertsData);

    const cumulativeMindMap=await generateCumulativeMindmapWithLLM(question,expertsData,finalAnswer);
    
    console.log("Cumulative mindmap:", cumulativeMindMap);
    
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
    renderCumulativeMindmap(cumulativeMindMap);
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
