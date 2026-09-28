const OpenAI = require("openai");
let client;
const categories = ["Food", "Travel", "Shopping", "Bills", "Entertainment", "Health", "Education", "Salary", "Other"];
const model = "openai/gpt-4o-mini";
const apiKey = process.env.OPENROUTER_API_KEY;

function getClient() {
  if (!apiKey) return null;
  if (!client) client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "http://localhost:5000",
      "X-Title": "Expense Tracker"
    },
    timeout: 5000
  });
  return client;
}

function localCategory(description) {
  const text = ` ${description.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const signals = {
    Food: ["food", "restaurant", "lunch", "dinner", "breakfast", "grocery", "groceries", "coffee", "meal", "pizza", "burger", "snack", "swiggy", "zomato", "dominos"],
    Travel: ["taxi", "uber", "ola", "flight", "airline", "hotel", "travel", "train", "railway", "bus", "metro", "fuel", "petrol", "diesel", "toll", "parking"],
    Shopping: ["shopping", "shop", "clothes", "clothing", "shirt", "dress", "shoes", "fashion", "amazon", "flipkart", "myntra", "mall", "store", "purchase", "bought", "online"],
    Bills: ["rent", "electric", "electricity", "water", "internet", "wifi", "phone", "mobile", "bill", "insurance", "recharge"],
    Entertainment: ["movie", "cinema", "concert", "game", "gaming", "netflix", "spotify", "music", "entertainment", "disney"],
    Health: ["doctor", "medicine", "pharmacy", "health", "hospital", "clinic", "dentist", "gym", "medical", "tablet"],
    Education: ["school", "course", "book", "tuition", "education", "college", "university", "class", "exam"],
    Salary: ["salary", "paycheck", "income", "bonus", "wages", "freelance"]
  };
  let bestCategory = "Other", bestScore = 0;
  for (const category of Object.keys(signals)) {
    const score = signals[category].reduce((total, word) => total + (text.includes(` ${word} `) ? 1 : 0), 0);
    if (score > bestScore) { bestCategory = category; bestScore = score; }
  }
  return bestCategory;
}

async function categorizeExpense(description) {
  if (!apiKey) return { category: localCategory(description), source: "local" };
  try {
    const r = await getClient().chat.completions.create({
      model, temperature: 0, messages: [
        { role: "system", content: `Return ONLY one category from: ${categories.join(", ")}.` },
        { role: "user", content: description }
      ]
    });
    const answer = String(r.choices?.[0]?.message?.content || "").trim().replace(/[^a-z]/gi, "").toLowerCase();
    const category = categories.find(item => item.toLowerCase() === answer);
    return { category: category || localCategory(description), source: category ? "ai" : "local" };
  } catch (e) { return { category: localCategory(description), source: "local" }; }
}
async function spendingInsight(expenses) {
  if (!apiKey) return { text: localInsight(expenses), source: "local" };
  const data = expenses.map(e => ({ amount: e.amount, description: e.description, category: e.category }));
  try {
    const r = await getClient().chat.completions.create({
      model, temperature: 0.2, max_tokens: 80, messages: [
        { role: "system", content: "Give one practical spending insight in under 30 words." },
        { role: "user", content: JSON.stringify(data) }
      ]
    });
    return { text: String(r.choices?.[0]?.message?.content || "").trim() || localInsight(expenses), source: "ai" };
  } catch (e) { return { text: localInsight(expenses), source: "local" }; }
}

function localInsight(expenses) {
  const totals = {};
  expenses.forEach(expense => { totals[expense.category] = (totals[expense.category] || 0) + Number(expense.amount); });
  const topCategory = Object.keys(totals).sort((a, b) => totals[b] - totals[a])[0];
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  return `Your highest spending category is ${topCategory}, totaling ₹${totals[topCategory].toFixed(2)}. Total spending is ₹${total.toFixed(2)}.`;
}
module.exports = { categorizeExpense, spendingInsight };
