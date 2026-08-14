import { env } from "./src/config/env";

async function run() {
  const apiKey = env.GEMINI_API_KEY;
  console.log("Testing API key format:", apiKey.substring(0, 10) + "...");
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    
    if (!response.ok) {
      console.error(`HTTP Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error("Response:", text);
      return;
    }
    
    const data = await response.json();
    console.log("Successfully fetched models!");
    console.log("Available models:");
    
    for (const model of data.models || []) {
      if (model.name.includes("gemini")) {
        console.log(`- ${model.name}`);
      }
    }
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

run();
