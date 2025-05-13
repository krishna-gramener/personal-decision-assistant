let token = null;
let token_url = null;
let openai_url = null;
let gemini_url = null;
let apiFormElement = null;
let mainContentElement = null;

// Setup API configuration and form handling
function setupAPI(apiForm, mainContent) {
    apiFormElement = apiForm;
    mainContentElement = mainContent;
    
    // Add form submit listener
    apiFormElement.addEventListener('submit', handleAPISubmit);
    
    // Initialize
    init();
}

// Check for stored API URLs
function checkStoredAPIs() {
    const stored_token_url = localStorage.getItem('token_url');
    const stored_openai_url = localStorage.getItem('openai_url');
    const stored_gemini_url = localStorage.getItem('gemini_url');
    
    if (stored_token_url && stored_openai_url && stored_gemini_url) {
        token_url = stored_token_url;
        openai_url = stored_openai_url;
        gemini_url = stored_gemini_url;
        return true;
    }
    return false;
}

// Show API form
function showAPIForm() {
    apiFormElement.classList.remove('hidden');
    mainContentElement.classList.add('hidden');
}

// Handle API form submission
async function handleAPISubmit(event) {
    event.preventDefault();
    const tokenApiInput = document.getElementById('tokenApi');
    const openaiApiInput = document.getElementById('openaiApi');
    const geminiApiInput = document.getElementById('geminiApi');
    
    token_url = tokenApiInput.value;
    openai_url = openaiApiInput.value;
    gemini_url = geminiApiInput.value;
    
    // Store in localStorage
    localStorage.setItem('token_url', token_url);
    localStorage.setItem('openai_url', openai_url);
    localStorage.setItem('gemini_url', gemini_url);
    
    // Hide form and show main content
    apiFormElement.classList.add('hidden');
    mainContentElement.classList.remove('hidden');
    
    // Initialize the app
    await init();
}

async function init() {
    try {
        if (!checkStoredAPIs()) {
            showAPIForm();
            return;
        }
        
        const response = await fetch(token_url, { credentials: "include" });
        const data = await response.json();
        token = data.token;
        
        // Show main content if we have the token
        mainContentElement.classList.remove('hidden');
        apiFormElement.classList.add('hidden');
    } catch (error) {
        console.error("Failed to initialize:", error.message);
    }
}

// Export the setup function
export { openai_url, gemini_url, token, setupAPI};