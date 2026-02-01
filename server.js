// server.js - PIF+AI Lookup Relay Server
// Fetches from new PIF+AI Google Sheet and transforms to standard format
import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json({ limit: "10mb" }));

// Enable CORS for Chrome extension
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// NEW PIF+AI Google Apps Script URL
const PIF_AI_APPS_SCRIPT = process.env.PIF_AI_APPS_SCRIPT || 
  "https://script.google.com/macros/s/AKfycbyGjV5K1XehVSTTttFtMQv2S5rQa8ri-g1uXaGquovQa_hCRAy8iL6Xwv0bLRvwyN1McA/exec";

// Health check endpoints
app.get("/", (req, res) => {
  console.log("🏥 Health check received");
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    message: "PIF+AI Lookup Relay - Active",
    service: "PIF+AI Sheet Data Provider",
    endpoints: {
      health: "GET /health",
      fetchPIF: "GET /fetch-pif"
    }
  });
});

app.get("/health", (req, res) => {
  console.log("🏥 Health check received");
  res.json({ 
    status: "ok", 
    service: "PIF+AI Lookup Relay",
    timestamp: new Date().toISOString() 
  });
});

// ===== FETCH PIF+AI DATA =====
// This endpoint fetches from the NEW Google Apps Script and transforms the data
// to match the format expected by the extension
app.get("/fetch-pif", async (req, res) => {
  const startTime = Date.now();
  console.log("📥 Fetching PIF+AI data from Google Apps Script...");
  
  try {
    // Fetch from the NEW Google Apps Script
    const response = await fetch(`${PIF_AI_APPS_SCRIPT}?action=fetchPIF`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 20000  // 20 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`Apps Script returned ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || "Apps Script returned success: false");
    }
    
    if (!result.data || !Array.isArray(result.data)) {
      throw new Error("Invalid data format from Apps Script");
    }
    
    // Log raw data structure for debugging (first row only)
    if (result.data.length > 0) {
      console.log("📊 Raw data sample (first row):", result.data[0]);
    }
    
    // TRANSFORM DATA TO STANDARD FORMAT
    // The NEW Apps Script returns data with different column indices
    // We need to map it to match what the extension expects
    //
    // Expected format for extension:
    //   row[0] = ? (unused)
    //   row[1] = Name
    //   row[2] = Symbol
    //   row[3] = ? (unused)
    //   row[4] = Rating
    //
    // Actual format from NEW Google Apps Script:
    //   row[0] = ? (need to verify)
    //   row[1] = Symbol
    //   row[2] = Name
    //   row[3] = Rating
    //
    // TRANSFORMATION: Rearrange to match OLD format
    const transformedData = result.data.map(row => {
      // Assuming NEW format is: [?, symbol, name, rating, ...]
      // Transform to OLD format: [?, name, symbol, ?, rating]
      return [
        row[0] || '',           // Index 0: Keep as is (unused by extension)
        row[2] || '',           // Index 1: Name (from row[2])
        row[1] || '',           // Index 2: Symbol (from row[1])
        row[3] || '',           // Index 3: Could be anything (unused)
        row[3] || ''            // Index 4: Rating (from row[3])
      ];
    });
    
    const elapsed = Date.now() - startTime;
    console.log(`✅ Successfully fetched and transformed ${transformedData.length} PIF+AI entries (${elapsed}ms)`);
    
    // Log sample transformed data
    if (transformedData.length > 0) {
      console.log("📊 Transformed sample:");
      console.log("   Name:", transformedData[0][1]);
      console.log("   Symbol:", transformedData[0][2]);
      console.log("   Rating:", transformedData[0][4]);
    }
    
    res.json({
      success: true,
      data: transformedData,
      count: transformedData.length,
      source: "PIF+AI Google Sheet",
      timestamp: new Date().toISOString(),
      elapsed: `${elapsed}ms`
    });
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ PIF+AI fetch error (${elapsed}ms):`, error.message);
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString(),
      elapsed: `${elapsed}ms`
    });
  }
});

// ===== DIAGNOSTIC ENDPOINT =====
// Returns raw data without transformation for debugging
app.get("/fetch-pif-raw", async (req, res) => {
  console.log("🔍 Fetching RAW PIF+AI data (no transformation)...");
  
  try {
    const response = await fetch(`${PIF_AI_APPS_SCRIPT}?action=fetchPIF`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 20000
    });
    
    if (!response.ok) {
      throw new Error(`Apps Script returned ${response.status}`);
    }
    
    const result = await response.json();
    
    console.log(`✅ Raw fetch successful: ${result.data?.length || 0} records`);
    
    // Return first 5 rows for inspection
    res.json({
      success: result.success,
      count: result.data?.length || 0,
      sample: result.data?.slice(0, 5) || [],
      fullData: result.data || []
    });
    
  } catch (error) {
    console.error("❌ Raw fetch error:", error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║   🚀 PIF+AI Lookup Relay Server                        ║
╚════════════════════════════════════════════════════════╝

📡 Port: ${PORT}
📊 PIF+AI Source: ${PIF_AI_APPS_SCRIPT.substring(0, 60)}...

📍 Endpoints:
   🏥 Health:        GET  /health
   📥 Fetch PIF:     GET  /fetch-pif
   🔍 Raw Data:      GET  /fetch-pif-raw (diagnostic)

✨ Status: Ready to serve PIF+AI data
⏰ Started: ${new Date().toISOString()}
  `);
});
