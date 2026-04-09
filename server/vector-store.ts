/**
 * HomeDirectAI Vector Store — Lightweight TF-IDF RAG
 * In-memory vector search over real estate knowledge chunks.
 * No external dependencies — pure TypeScript.
 */

export interface KnowledgeChunk {
  id: string;
  content: string;
  category: string;
  subcategory?: string;
  keywords: string[];
}

export interface SearchResult {
  chunk: KnowledgeChunk;
  score: number;
}

const STOP_WORDS = new Set([
  "a","an","the","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","may","might","shall","can",
  "to","of","in","for","on","with","at","by","from","as","into","through","during",
  "before","after","above","below","between","under","again","further","then","once",
  "here","there","when","where","why","how","all","both","each","few","more","most",
  "other","some","such","no","nor","not","only","own","same","so","than","too","very",
  "and","but","or","if","while","that","this","it","i","you","he","she","we","they",
  "what","which","who","whom","its","my","your","his","her","our","their",
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

class VectorStore {
  private chunks: KnowledgeChunk[] = [];
  private vocabulary: string[] = [];
  private idf: Map<string, number> = new Map();
  private vectors: Map<string, number[]> = new Map();

  addChunk(chunk: KnowledgeChunk): void { this.chunks.push(chunk); }
  addChunks(chunks: KnowledgeChunk[]): void { this.chunks.push(...chunks); }

  buildIndex(): void {
    const docTokens = this.chunks.map(c => tokenize(c.content + " " + c.keywords.join(" ")));
    const vocabSet = new Set<string>();
    docTokens.forEach(tokens => tokens.forEach(t => vocabSet.add(t)));
    this.vocabulary = [...vocabSet];

    const N = this.chunks.length;
    const vocabIndex = new Map(this.vocabulary.map((v, i) => [v, i]));

    // Compute IDF
    const docFreq = new Map<string, number>();
    docTokens.forEach(tokens => {
      const unique = new Set(tokens);
      unique.forEach(t => docFreq.set(t, (docFreq.get(t) || 0) + 1));
    });
    this.vocabulary.forEach(term => {
      this.idf.set(term, Math.log(N / (1 + (docFreq.get(term) || 0))));
    });

    // Compute TF-IDF vectors
    this.chunks.forEach((chunk, i) => {
      const tokens = docTokens[i];
      const tf = new Map<string, number>();
      tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));
      const maxTf = Math.max(...tf.values(), 1);
      const vec = new Array(this.vocabulary.length).fill(0);
      tf.forEach((count, term) => {
        const idx = vocabIndex.get(term);
        if (idx !== undefined) vec[idx] = (count / maxTf) * (this.idf.get(term) || 0);
      });
      this.vectors.set(chunk.id, vec);
    });
  }

  search(query: string, topK: number = 5, categoryFilter?: string): SearchResult[] {
    const tokens = tokenize(query);
    const vocabIndex = new Map(this.vocabulary.map((v, i) => [v, i]));
    const qVec = new Array(this.vocabulary.length).fill(0);
    tokens.forEach(t => {
      const idx = vocabIndex.get(t);
      if (idx !== undefined) qVec[idx] = this.idf.get(t) || 0;
    });

    const candidates = categoryFilter
      ? this.chunks.filter(c => c.category === categoryFilter)
      : this.chunks;

    const results: SearchResult[] = candidates.map(chunk => ({
      chunk,
      score: cosine(qVec, this.vectors.get(chunk.id) || []),
    }));

    return results.sort((a, b) => b.score - a.score).slice(0, topK).filter(r => r.score > 0.01);
  }

  getCategories(): string[] {
    return [...new Set(this.chunks.map(c => c.category))];
  }
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; magA += a[i] * a[i]; magB += b[i] * b[i]; }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Knowledge Chunks ─────────────────────────────────────────────────────────

function getKnowledgeChunks(): KnowledgeChunk[] {
  return [
    // Florida Law
    { id: "fl-johnson-davis", category: "florida_law", keywords: ["disclosure","defect","seller","material"], content: "Johnson v. Davis (1985) requires Florida sellers to disclose all known material defects affecting property value. This applies even though Florida is generally a buyer-beware state. Concealing known defects can result in contract rescission and damages." },
    { id: "fl-doc-stamps", category: "florida_law", keywords: ["documentary","stamps","tax","deed","transfer"], content: "Florida documentary stamp taxes: $0.70 per $100 on deeds (seller pays), $0.35 per $100 on mortgage notes (buyer pays). Intangible tax on mortgages: $0.20 per $100 of loan amount (buyer pays). On a $400K sale with $320K loan: seller doc stamps = $2,800, buyer mortgage doc stamps = $1,120, intangible tax = $640." },
    { id: "fl-homestead", category: "florida_law", keywords: ["homestead","exemption","property","tax","primary"], content: "Florida homestead exemption provides up to $50,000 off assessed value for primary residence. First $25K applies to all taxes including school. Additional $25K applies to non-school taxes if assessed value exceeds $50K. Apply by March 1 at county property appraiser. Save Our Homes caps annual assessed value increases at 3% or CPI." },
    { id: "fl-inspection-period", category: "florida_law", keywords: ["inspection","period","15","days","contingency"], content: "Florida FAR/BAR contracts provide a 15-day inspection period from the effective date. During this period, buyers can inspect and terminate for any reason, receiving earnest money back. After expiration without written termination, buyer accepts the property as-is under As-Is contracts." },
    { id: "fl-transaction-broker", category: "florida_law", keywords: ["transaction","broker","agency","fiduciary","representation"], content: "Florida Statute 475.278 makes transaction broker the default relationship. Transaction brokers provide limited representation to both parties — honest dealing, skill and care, disclosure of known facts. They do NOT have full fiduciary duties to either party." },
    { id: "fl-as-is", category: "florida_law", keywords: ["as-is","contract","far","bar","repair"], content: "The FAR/BAR As-Is contract is Florida's most common residential contract. Seller makes no repair obligations. However: seller must still disclose known defects per Johnson v. Davis, buyer retains full 15-day inspection period, and buyer can still exit during inspection period for any reason." },
    { id: "fl-title-rates", category: "florida_law", keywords: ["title","insurance","rate","florida","statute"], content: "Florida title insurance rates are set by statute — all insurers charge the same. Rates: first $100K at $5.75/$1000, $100K-$1M at $5.00/$1000, $1M-$5M at $2.50/$1000. Example: $400K purchase = $575 + $1,500 = $2,075. Seller customarily pays owner's policy in most FL counties." },
    { id: "fl-closing-process", category: "florida_law", keywords: ["closing","title","company","deed","recording"], content: "Florida closings happen at a title company, not an attorney's office. Process: Closing Disclosure sent 3 days before, both parties sign documents, buyer wires funds, title company disburses, deed recorded with county clerk, keys exchanged. Takes 30-90 minutes at the table." },
    { id: "fl-radon", category: "florida_law", keywords: ["radon","disclosure","gas","testing","mitigation"], content: "Florida requires radon disclosure in all residential contracts. Radon is naturally occurring radioactive gas, second leading cause of lung cancer. Testing: 48-hour canister ($15-30 DIY, $100-200 professional). EPA action level: 4 pCi/L. Mitigation systems: $800-2,500." },
    { id: "fl-earnest-money", category: "florida_law", keywords: ["earnest","money","deposit","escrow","good faith"], content: "Earnest money in Florida is typically 1-3% of purchase price, deposited within 3 business days of acceptance. Held by title company escrow. Disputes follow Florida escrow dispute procedures — holder cannot release without both parties' agreement or court order." },
    // Contracts
    { id: "contracts-contingencies", category: "contracts", keywords: ["contingency","inspection","financing","appraisal","waive"], content: "Standard contingencies: Inspection (15 days), Financing (21 days), Appraisal. Each protects earnest money if conditions aren't met. Waiving contingencies strengthens offers but increases risk. Cash offers are strongest — no financing contingency, faster close." },
    { id: "contracts-earnest", category: "contracts", keywords: ["earnest","deposit","money","escrow","amount"], content: "Earnest money deposit shows good faith. Florida standard: 1-3% of purchase price. Held in escrow by title company. Released to seller at closing or returned to buyer if contract terminated under valid contingency. Higher earnest money strengthens offer position." },
    { id: "contracts-effective-date", category: "contracts", keywords: ["effective","date","signed","timeline","starts"], content: "The effective date is when the last party signs the contract — this starts ALL timelines. Inspection period, financing contingency, closing date — all measured from effective date. Verify this date carefully as it controls every deadline in the transaction." },
    // Negotiation
    { id: "neg-first-offer", category: "negotiation", keywords: ["first","offer","strategy","below","asking"], content: "First offer strategy depends on market conditions. Balanced market: 3-7% below asking. Seller's market: at or near asking. Buyer's market: 5-10% below. Consider days on market, price reductions, and seller motivation. Cash offers and quick closes can offset lower prices." },
    { id: "neg-counter-strategy", category: "negotiation", keywords: ["counter","offer","strategy","negotiate","middle"], content: "Counter-offer strategies: Meet in the middle (shows good faith), ask for closing cost credits (keeps price but reduces buyer costs), adjust timeline (faster close for lower price), escalation clause (auto-increase up to max if competing offers)." },
    { id: "neg-multiple-offers", category: "negotiation", keywords: ["multiple","offers","bidding","war","compete"], content: "Multiple offer situations: Use escalation clause, increase earnest money to 2-3%, offer flexible closing date, waive non-essential contingencies, write a personal letter (legal in FL). Pre-approval letter from local lender strengthens your position." },
    { id: "neg-closing-credits", category: "negotiation", keywords: ["closing","cost","credit","seller","concession"], content: "Seller closing cost credits: Common negotiation tool. Seller pays agreed amount toward buyer's closing costs. Conventional: up to 3% (with 10%+ down), FHA: up to 6%, VA: up to 4%. Effectively reduces buyer's out-of-pocket without changing purchase price." },
    // Inspection
    { id: "insp-4point", category: "inspection", keywords: ["4-point","four","point","insurance","systems"], content: "4-point inspection examines roof, HVAC, electrical, and plumbing. Required by most FL insurers for homes 30+ years old. Cost: $75-150. Failing items may require repair before insurer issues policy. Often bundled with wind mitigation for $150-250." },
    { id: "insp-wind-mit", category: "inspection", keywords: ["wind","mitigation","insurance","savings","discount"], content: "Wind mitigation report documents hurricane-resistant features: roof shape, roof-to-wall connections, roof covering, secondary water resistance, opening protection. Can save 20-45% on wind insurance premium. Cost: $75-150. Every FL homeowner should have one." },
    { id: "insp-sinkhole", category: "inspection", keywords: ["sinkhole","assessment","hillsborough","pasco","hernando"], content: "Sinkhole risk is highest in Hillsborough, Pasco, and Hernando counties. Signs: circular depressions, foundation cracks, doors/windows sticking, separation of walls. Assessment costs $500-3000. Sinkhole insurance is separate from homeowner's. Remediation: $5,000-$100,000+." },
    { id: "insp-chinese-drywall", category: "inspection", keywords: ["chinese","drywall","sulfur","copper","corrosion"], content: "Chinese drywall (installed 2006-2009) releases sulfur compounds that corrode copper pipes and wiring. Signs: sulfur/rotten egg smell, blackened copper pipes, corroded AC coils, blackened electrical outlets. Remediation requires removing all affected drywall — $100K+. Mandatory disclosure in FL." },
    { id: "insp-wdo", category: "inspection", keywords: ["termite","wdo","wood","destroying","organism"], content: "WDO (Wood Destroying Organism) inspection checks for termites, wood rot, and fungal damage. Required for FHA and VA loans. Cost: $75-125. FL's warm climate makes termites very common. Active infestation requires treatment ($500-2,500). Preventive treatment recommended." },
    // Mortgage
    { id: "mort-conventional", category: "mortgage", keywords: ["conventional","loan","down","payment","pmi"], content: "Conventional loans: 3-20% down payment, 620+ credit score, PMI required if under 20% down. PMI costs 0.5-1% of loan annually, removed at 80% LTV. Best rates with 740+ credit and 20%+ down. Conforming limit in FL: $766,550 (2024)." },
    { id: "mort-fha", category: "mortgage", keywords: ["fha","loan","down","payment","first","time"], content: "FHA loans: 3.5% down with 580+ credit (10% down with 500-579). Mortgage insurance for life of loan (MIP: 0.55% annually + 1.75% upfront). More lenient DTI requirements (up to 50% with compensating factors). Popular with first-time buyers." },
    { id: "mort-va", category: "mortgage", keywords: ["va","veteran","military","zero","down"], content: "VA loans: 0% down payment, no PMI, competitive rates. For veterans, active-duty, and eligible spouses. VA funding fee: 1.25-3.3% (can be financed). No maximum loan amount (but lender limits apply). One of the best mortgage products available." },
    { id: "mort-dti", category: "mortgage", keywords: ["dti","debt","income","ratio","qualify"], content: "DTI (Debt-to-Income) ratio: Total monthly debts / gross monthly income. Front-end (housing only): ideal under 28%. Back-end (all debts): most lenders want under 43%, FHA allows up to 50% with compensating factors. Reduce DTI by paying off debts before applying." },
    { id: "mort-preapproval", category: "mortgage", keywords: ["pre-approval","pre-qualification","lender","letter"], content: "Pre-approval vs pre-qualification: Pre-qual is an estimate based on stated income. Pre-approval is verified — lender checks credit, income, assets, and employment. Pre-approval letter makes your offer much stronger. Get pre-approved BEFORE house hunting." },
    // Appraisal
    { id: "appr-process", category: "appraisal", keywords: ["appraisal","process","comparable","value","lender"], content: "Appraisals are ordered by the lender, paid by buyer ($400-600). Appraiser uses comparable sales from last 6 months within 1 mile. Considers condition, upgrades, location, lot size. If appraisal < purchase price: renegotiate, buyer covers gap, or cancel with appraisal contingency." },
    { id: "appr-low", category: "appraisal", keywords: ["low","appraisal","gap","renegotiate","challenge"], content: "Low appraisal options: (1) Seller reduces price to appraised value, (2) Buyer pays cash for the gap, (3) Split the difference, (4) Challenge with Reconsideration of Value — submit 3 better comps the appraiser missed, (5) Walk away with appraisal contingency." },
    // Title & Closing
    { id: "title-search", category: "title_closing", keywords: ["title","search","lien","encumbrance","clear"], content: "Title search examines ownership history for liens, encumbrances, easements, and defects. Takes 1-3 weeks. Common issues: unpaid taxes, contractor liens, judgment liens, HOA liens, boundary disputes. Title insurance protects against unknown defects discovered after closing." },
    { id: "title-wire-fraud", category: "title_closing", keywords: ["wire","fraud","transfer","closing","verify"], content: "Wire fraud is the #1 cybercrime in real estate. Criminals intercept emails and send fake wire instructions. ALWAYS verify wire instructions by calling your title company using a phone number from their official website — NEVER from an email. If funds go to wrong account, recovery is nearly impossible." },
    { id: "title-closing-costs", category: "title_closing", keywords: ["closing","costs","breakdown","buyer","seller"], content: "Florida closing costs breakdown — Buyer: lender fees (1%), title insurance, doc stamps on mortgage ($0.35/$100), intangible tax ($0.20/$100), prepaid taxes/insurance, recording ($200), survey ($300-500). Total: 2-5% of price. Seller: doc stamps on deed ($0.70/$100), title insurance, platform fee (1%)." },
    // Insurance
    { id: "ins-florida-crisis", category: "insurance", keywords: ["insurance","crisis","florida","citizens","premium"], content: "Florida's insurance crisis: Many private insurers have left the market. Premiums have doubled or tripled. Citizens Property Insurance is the state insurer of last resort but has coverage limitations. Wind mitigation and new roofs are the best ways to reduce premiums. Shop 3+ insurers." },
    { id: "ins-flood", category: "insurance", keywords: ["flood","insurance","fema","zone","nfip"], content: "Flood insurance is required by lenders in FEMA flood zones A and AE. NFIP (National Flood Insurance Program) or private flood policies available. Private flood often cheaper with better coverage. Zone X properties don't require flood insurance but it's still recommended. Check FEMA maps before buying." },
    { id: "ins-wind-coverage", category: "insurance", keywords: ["wind","hurricane","coverage","coastal","separate"], content: "In coastal Florida, wind coverage may be separate from homeowner's policy. Wind deductibles are often 2-5% of dwelling value (much higher than other deductibles). Wind mitigation report can save 20-45%. Hurricane shutters, impact windows, and hip roofs reduce premiums significantly." },
    // Platform
    { id: "plat-overview", category: "platform", keywords: ["homedirectai","platform","fee","commission","savings"], content: "HomeDirectAI charges 1% at closing vs traditional 5-6% agent commission. On a $400K home: our fee = $4,000 vs traditional = $20,000-24,000. Savings: $16,000-20,000. AI handles negotiations, documents, and closing coordination. Chaperone walkthroughs: $20 each." },
    { id: "plat-chaperone", category: "platform", keywords: ["chaperone","walkthrough","showing","tour","doordash"], content: "HomeDirectAI's chaperone model: local, background-checked individuals guide property tours for $20. Like DoorDash for home showings. Chaperones unlock the property, walk buyers through, and answer basic questions. Buyers schedule online, chaperone accepts the gig. Chaperones earn $15 per walkthrough." },
    { id: "plat-ai-agent", category: "platform", keywords: ["ai","agent","negotiation","replace","traditional"], content: "HomeDirectAI's AI agent replaces the traditional real estate agent entirely. It handles: property search, offer preparation, negotiation strategy, counter-offers, document generation, inspection guidance, closing coordination, and portal management for all professionals (inspector, appraiser, lender, title, insurance)." },
    // Advanced Scenarios
    { id: "adv-short-sale", category: "advanced", keywords: ["short","sale","foreclosure","bank","approval"], content: "Short sales require lender approval since the home sells for less than owed. Timeline: 60-120+ days for bank response. Seller submits hardship letter + financials. Bank orders BPO. Buyer must be patient — extensions are common. Request deficiency waiver from bank. Title may have junior liens requiring negotiation." },
    { id: "adv-1031-exchange", category: "advanced", keywords: ["1031","exchange","tax","deferred","investment"], content: "1031 Exchange: Tax-deferred exchange of investment property. Must identify replacement property within 45 days, close within 180 days. Qualified intermediary holds proceeds (you cannot touch the money). Like-kind property required (any real estate for real estate). Cannot be used for primary residence." },
    { id: "adv-new-construction", category: "advanced", keywords: ["new","construction","builder","warranty","punch"], content: "New construction uses builder contracts (not FAR/BAR). Deposits 10-20%, possibly non-refundable. Timeline: 6-12 months with common delays. Warranties: structural 10yr, mechanical 2yr, finish 1yr. Always get independent inspection before closing. Final walkthrough punch list is critical." },
    { id: "adv-investor", category: "advanced", keywords: ["investor","rental","cap","rate","cash","flow"], content: "Investment property analysis: Cap rate = NOI/Price. Cash-on-cash = Annual cash flow / Cash invested. Tampa Bay SFR cap rates: 2-4%. Investment loans require 15-25% down at higher rates. DSCR loans qualify based on property income, not personal. Factor in property management at 8-10% of gross rent." },
    // Emotional Support
    { id: "emo-deal-falling", category: "emotional", keywords: ["deal","falling","through","disappointed","failed"], content: "Deals fall through in about 20% of transactions. This is disappointing but normal. Your pre-approval is still valid, earnest money is protected by contingencies, and you're now more experienced. Take a day to decompress, then get back to searching. Many buyers find better homes the second time." },
    { id: "emo-inspection-fear", category: "emotional", keywords: ["inspection","scared","worried","problems","issues"], content: "Inspection reports always look worse than reality — inspectors document EVERYTHING. Categorize: safety/structural (must address) vs maintenance (normal wear) vs cosmetic (ignore). Most inspections lead to credits of 1-2% of price. You can always walk away during the inspection period. The inspection protects you." },
    { id: "emo-bidding-war", category: "emotional", keywords: ["bidding","war","lost","outbid","competing"], content: "Losing a bidding war is painful but you made a smart decision not to overpay. Overpaying creates risk: higher payments, negative equity potential, appraisal issues. The market always has new inventory. Use this experience: next time, lead with your strongest offer. Ask to be backup offer — winning bids fall through 10-15% of the time." },
  ];
}

// ── Singleton ────────────────────────────────────────────────────────────────

let _store: VectorStore | null = null;

export function initializeKnowledgeStore(): VectorStore {
  if (_store) return _store;
  _store = new VectorStore();
  _store.addChunks(getKnowledgeChunks());
  _store.buildIndex();
  console.log(`[VectorStore] Initialized with ${getKnowledgeChunks().length} chunks`);
  return _store;
}

/**
 * Search the knowledge store and return concatenated context for LLM injection.
 */
export function getRelevantContext(query: string, topK: number = 5, category?: string): string {
  const store = initializeKnowledgeStore();
  const results = store.search(query, topK, category);
  if (results.length === 0) return "";
  return results.map(r => `[${r.chunk.category}] ${r.chunk.content}`).join("\n\n");
}
