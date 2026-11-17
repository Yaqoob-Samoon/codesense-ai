🧠 CodeSense AI - Enterprise Code Reviewer

CodeSense AI is a lightweight, purely client-side web application that acts as an elite senior engineer. By integrating the Google Gemini API (gemini-2.5-flash), it provides deep, context-aware code reviews, security vulnerability scans, and visual architecture generation directly in your browser.

✨ Key Features

Multi-Modal AI Analysis: Instantly analyze code for logic bugs, security vulnerabilities (OWASP), and cyclomatic complexity.

Visual Architecture Maps: Automatically parses your code structure and generates dynamic flowcharts and dependency graphs using Mermaid.js.

RAG Context Injection: Allows users to input custom "Company Guidelines" (Retrieval-Augmented Generation style) that strictly dictate how the AI reviews the code.

Code Optimization: Rewrites inefficient code into clean, best-practice structures formatted in side-by-side diffs.

Privacy-First & Serverless: A 100% vanilla JavaScript frontend. API calls are made directly from your browser to Google AI Studio. Session history and API keys are stored safely in local browser storage.

Live Syntax Highlighting: Integrated with Highlight.js for beautiful, auto-detected language formatting.

🛠️ Tech Stack

Frontend: HTML5, CSS3, Vanilla JavaScript (ES6+)

AI Engine: Google Gemini API (gemini-2.5-flash)

Libraries:

highlight.js (Syntax highlighting)

marked.js & DOMPurify (Safe Markdown rendering)

mermaid.js (Architecture visualization)

🚀 Getting Started

Since this is a client-side application, no backend server or Node.js environment is required!

1. Clone the repository

git clone https://github.com/Yaqoob-Samoon/codesense-ai.git
cd codesense-ai


2. Run the App

Simply open the index.html file in any modern web browser.
(Tip: You can use VS Code's "Live Server" extension for a better development experience).

3. Initialize the AI

Get a free Gemini API Key from Google AI Studio.

Paste the key into the CodeSense AI modal upon opening the app.

Paste some code, select an analysis tab (Bug, Security, Architecture, etc.), and hit run!

👨‍💻 Author

Yaqoob Samoon

Role: MERN Stack & AI Developer

LinkedIn: linkedin.com/in/yaqoob-samoon

GitHub: github.com/Yaqoob-Samoon
