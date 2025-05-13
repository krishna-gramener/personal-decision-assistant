import { showLoading, callOpenAI, formatExtractedData, getConversationContext } from './script.js';

// Store current experts data
let currentExpertsData = [];

// Get experts for the roundtable
async function getExperts(question) {
  showLoading("Identifying expert panel...");

  const systemPrompt = `
    You are an assistant tasked with identifying 3 experts for a roundtable discussion
    on a specific question. These experts should be relevant to analyzing clinical development
    and drug trial data, focusing on aspects important to a Clinical Development Director.
    
    Consider the full conversation history when selecting experts, as the current question may relate 
    to previous discussion points about clinical trials, drug development, or patient outcomes.
    
    For the given question, conversation history, and document context, suggest 3 distinct experts who would
    have valuable perspectives on clinical development. Each expert should have different specialties
    and backgrounds to ensure comprehensive insights into trial design, safety, efficacy, and regulatory aspects.

    The experts should be able to analyze and interpret:
    - Clinical trial data and documentation
    - Safety and efficacy metrics
    - Statistical patterns and relationships
    - Regulatory compliance requirements
    - Protocol design considerations
    - Patient outcomes and adverse events
    - Historical trial data and trends

    Select from relevant specialties such as:
    - Clinical Trial Design
    - Biostatistics
    - Medical Safety
    - Regulatory Affairs
    - Clinical Operations
    - Data Management
    - Patient Safety
    - Medical Affairs

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
    ${formatExtractedData()}
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
    with expertise in ${expert.specialty}, focusing on clinical development aspects.

    Context: The user is a Clinical Development Director analyzing clinical data and outcomes.
    
    Generate questions that:
    1. Leverage this expert's clinical expertise in relation to:
       - Trial design and methodology
       - Safety and efficacy metrics
       - Regulatory compliance
       - Patient outcomes
    2. Focus on analyzing clinical data patterns and trends
    3. Help extract insights relevant to drug development decisions
    4. Address specific aspects of:
       - Statistical significance
       - Protocol adherence
       - Adverse events
       - Treatment effectiveness
    5. Consider implications for:
       - Future trial design
       - Safety monitoring
       - Regulatory submissions
       - Clinical practice

    Your questions should be clear, specific, and directly related to clinical development aspects of the available data.
    Focus on generating actionable insights for clinical trial optimization and drug development.
  `;

  const documentContext = `
    Available document content:
    ${formatExtractedData()}
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

    As a clinical development expert, analyze the provided data and answer the following questions.
    Your answers should:
    1. Focus on clinical relevance and implications:
       - Safety and efficacy outcomes
       - Statistical significance of findings
       - Protocol compliance insights
       - Patient-centric considerations
    
    2. Reference specific clinical data points:
       - Trial outcomes and metrics
       - Adverse event patterns
       - Treatment effectiveness indicators
       - Protocol adherence measures
    
    3. Provide evidence-based insights for:
       - Clinical decision-making
       - Trial design optimization
       - Risk mitigation strategies
       - Regulatory considerations
    
    4. Consider implications for:
       - Future trial protocols
       - Safety monitoring procedures
       - Regulatory submissions
       - Clinical practice guidelines

    Format your responses to highlight:
    - Key clinical findings
    - Statistical significance
    - Safety signals
    - Recommendations for clinical development
  `;

  const documentContext = `
    Available document content:
    ${formatExtractedData()}
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
    ${formatExtractedData()}
  `;

  try {
    return await callOpenAI(systemPrompt, userMessage);
  } catch (error) {
    throw new Error(`Failed to generate final answer: ${error.message}`);
  }
}

// Update current experts data
function updateExpertsData(data) {
    currentExpertsData = data;
}

export {
    getExperts,
    generateExpertQuestions,
    getExpertAnswers,
    generateExpertSummary,
    generateFinalAnswer,
    currentExpertsData,
    updateExpertsData
};