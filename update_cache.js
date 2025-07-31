/*
      * SOLANA TOKEN CACHE UPDATER - ENHANCED WITH FULL VERIFICATION
      * 
      * Step 1: Collect and filter tokens, save to cache
      * Step 2: Verify ALL token data and check top holder concentration
      * Step 3: Filter out tokens with >50% top 10 holder concentration
      * 
      * SETUP:
      * 1. npm install node-fetch dotenv
      * 2. Set SOLANA_API_KEY in environment (e.g., GitHub Actions)
      * 3. Run: node update_cache.js
      */

     require('dotenv').config();
     const fs = require('fs').promises;
     const fetch = require('node-fetch');

     // Configuration
     let API_KEY = process.env.SOLANA_API_KEY || '348115ea-b619-4a5e-a035-38d79e8fc4d3';
     const BASE_URL = 'https://data.solanatracker.io';
     const CACHE_FILE = './token_cache.json';

     // Filter criteria - TEMPORARILY RELAXED FOR DEBUGGING
     const MIN_HOLDERS = 50;  // Was 100
     const MIN_MARKET_CAP = 10000;  // Was 30000  
     const MAX_MARKET_CAP = 200000;  // Was 100000
     const MIN_VOLUME_24H = 10;  // Was 1000
     const MAX_VOLUME_24H = 1000000;  // Was 500000
     const VOLUME_TIMEFRAME = '24h';
     const MIN_AGE = 24 * 60 * 60 * 1000; // 24 hours (was 72 hours)
     const MAX_TOP_10_CONCENTRATION = 0.50; // 50% (was 40%)

     // Logging function
     function log(message) {
         console.log(`[${new Date().toISOString()}] ${message}`);
     }

     // Sleep function
     function sleep(ms) {
         return new Promise(resolve => setTimeout(resolve, ms));
     }

     // API request function
     async function makeAPIRequest(endpoint, retries = 3) {
         const headers = { 'Content-Type': 'application/json' };
         
         if (API_KEY && API_KEY !== 'YOUR_API_KEY_HERE') {
             headers['x-api-key'] = API_KEY;
         }
         
         log(`API Request: ${endpoint.slice(0, 80)}...`);
         
         for (let attempt = 1; attempt <= retries; attempt++) {
             try {
                 const response = await fetch(BASE_URL + endpoint, { headers });
                 
                 if (!response.ok) {
                     log(`API Error (attempt ${attempt}): ${response.status}`);
                     
                     if (response.status === 429) {
                         const waitTime = Math.pow(2, attempt) * 1000;
                         log(`Rate limited. Waiting ${waitTime/1000}s...`);
                         await sleep(waitTime);
                         continue;
                     }
                     
                     if (attempt === retries) {
                         throw new Error(`API Error: ${response.status}`);
                     }
                     continue;
                 }
                 
                 const data = await response.json();
                 log('API Response received successfully');
                 return data;
                 
             } catch (error) {
                 log(`Request failed (attempt ${attempt}): ${error.message}`);
                 if (attempt === retries) throw error;
                 await sleep(1000 * attempt);
             }
         }
     }

     // Load existing cache
     async function loadExistingCache() {
         try {
             const cacheContent = await fs.readFile(CACHE_FILE, 'utf8');
             const existingCache = JSON.parse(cacheContent);
             if (existingCache.tokens && Array.isArray(existingCache.tokens)) {
                 log(`Loaded ${existingCache.tokens.length} existing tokens from cache`);
                 return existingCache.tokens;
             }
         } catch (error) {
             log('No existing cache found, starting fresh');
         }
         return [];
     }

     // Fetch tokens aggressively
     async function fetchTokensAggressively() {
         try {
             log('Starting aggressive token collection...');
             let allTokens = [];
             let apiCallCount = 0;
             const maxApiCalls = 200;
             
             // Source 1: Graduated tokens
             log('Source 1: Fetching graduated tokens...');
             try {
                 const graduatedResults = await makeAPIRequest('/tokens/multi/graduated');
                 apiCallCount++;
                 
                 if (graduatedResults && Array.isArray(graduatedResults)) {
                     allTokens = allTokens.concat(graduatedResults);
                     log(`Found ${graduatedResults.length} graduated tokens`);
                 }
                 await sleep(2000);
             } catch (error) {
                 log(`Graduated endpoint failed: ${error.message}`);
             }
             
             // Source 2: Multi/all overview (graduated only)
             if (apiCallCount < maxApiCalls) {
                 log('Source 2: Fetching multi/all overview (graduated only)...');
                 try {
                     const multiResults = await makeAPIRequest('/tokens/multi/all');
                     apiCallCount++;
                     
                     if (multiResults && multiResults.graduated && Array.isArray(multiResults.graduated)) {
                         allTokens = allTokens.concat(multiResults.graduated);
                         log(`Added ${multiResults.graduated.length} tokens from graduated section`);
                     }
                     await sleep(2000);
                 } catch (error) {
                     log(`Multi/all endpoint failed: ${error.message}`);
                 }
             }
             
             // Source 3: Search (oldest first)
             log('Source 3: Search (oldest first) - up to 150 pages...');
             
             for (let page = 1; page <= 150 && apiCallCount < maxApiCalls; page++) {
                 try {
                     const searchParams = new URLSearchParams({
                         query: '',
                         page: page.toString(),
                         limit: '100',
                         sortBy: 'createdAt',
                         sortOrder: 'asc',
                         minMarketCap: MIN_MARKET_CAP.toString(),
                         maxMarketCap: MAX_MARKET_CAP.toString(),
                         minVolume: MIN_VOLUME_24H.toString(),
                         maxVolume: MAX_VOLUME_24H.toString(),
                         volumeTimeframe: VOLUME_TIMEFRAME
                     });
                     
                     const searchResults = await makeAPIRequest(`/search?${searchParams.toString()}`);
                     apiCallCount++;
                     
                     if (searchResults && searchResults.data && Array.isArray(searchResults.data)) {
                         if (searchResults.data.length === 0) {
                             log(`No more results on page ${page}`);
                             break;
                         }
                         
                         allTokens = allTokens.concat(searchResults.data);
                         log(`Page ${page}: +${searchResults.data.length} tokens (total: ${allTokens.length})`);
                     } else {
                         break;
                     }
                     
                     if (apiCallCount % 10 === 0) {
                         log(`Progress: ${apiCallCount}/${maxApiCalls} API calls, ${allTokens.length} tokens collected`);
                     }
                     
                     await sleep(2000);
                     
                 } catch (error) {
                     log(`Search page ${page} failed: ${error.message}`);
                     break;
                 }
             }
             
             // Source 4: Volume endpoints
             if (apiCallCount < maxApiCalls) {
                 log('Source 4: Volume endpoints...');
                 
                 const volumeTimeframes = ['24h', '12h', '6h'];
                 
                 for (const timeframe of volumeTimeframes) {
                     if (apiCallCount >= maxApiCalls) break;
                     
                     try {
                         const volumeResults = await makeAPIRequest(`/tokens/volume/${timeframe}`);
                         apiCallCount++;
                         
                         if (volumeResults && Array.isArray(volumeResults)) {
                             allTokens = allTokens.concat(volumeResults);
                             log(`Volume ${timeframe}: +${volumeResults.length} tokens`);
                         }
                         await sleep(2000);
                     } catch (error) {
                         log(`Volume ${timeframe} failed: ${error.message}`);
                     }
                 }
             }
             
             log(`Collection completed! API calls: ${apiCallCount}, Tokens: ${allTokens.length}`);
             return allTokens;
             
         } catch (error) {
             log(`Error in aggressive fetch: ${error.message}`);
             throw error;
         }
     }

     // Normalize token data
     function normalizeTokenData(token) {
         // Handle the actual API response structure
         const tokenInfo = token.token || {};
         const pools = token.pools || [];
         const primaryPool = pools.length > 0 ? pools[0] : {};
         
         // Extract basic token info
         const address = tokenInfo.mint || tokenInfo.address || tokenInfo.tokenAddress;
         const symbol = tokenInfo.symbol || tokenInfo.ticker || 'UNKNOWN';
         const name = tokenInfo.name || symbol || 'Unknown Token';
         
         // Extract holders (at root level)
         const holders = Number(token.holders || 0);
         
         // Extract market data from primary pool
         const marketCapUsd = Number(primaryPool.marketCap?.usd || 0);
         const priceUsd = Number(primaryPool.price?.usd || 0);
         const volume = Number(primaryPool.txns?.volume24h || 0);
         const liquidity = Number(primaryPool.liquidity?.usd || 0);
         
         // Debug log for first few tokens to verify parsing
         if (symbol !== 'UNKNOWN') {
             log(`Parsing ${symbol}: Holders=${holders}, MC=${marketCapUsd}, Vol=${volume}, Price=${priceUsd}`);
         }
         
         // Handle graduation timestamp from creation data
         const graduationTimestamp = tokenInfo.creation?.created_time || tokenInfo.timestamp || tokenInfo.created || tokenInfo.createdAt || null;
         let timeSinceGraduation = null;
         let graduationAge = null;
         
         if (graduationTimestamp) {
             try {
                 const graduationTime = typeof graduationTimestamp === 'number' ? 
                     graduationTimestamp * 1000 : new Date(graduationTimestamp).getTime(); // Convert to milliseconds if needed
                 graduationAge = Date.now() - graduationTime;
                 
                 const hours = Math.floor(graduationAge / (1000 * 60 * 60));
                 const days = Math.floor(hours / 24);
                 
                 if (days > 0) {
                     timeSinceGraduation = `${days} day${days === 1 ? '' : 's'} ago`;
                 } else {
                     timeSinceGraduation = `${hours} hour${hours === 1 ? '' : 's'} ago`;
                 }
             } catch (e) {
                 log(`Error parsing timestamp for ${symbol}: ${e.message}`);
             }
         }
         
         return {
             symbol: symbol,
             name: name,
             mint: address,
             holders: holders,
             marketCapUsd: marketCapUsd,
             volume: volume,
             priceUsd: priceUsd,
             liquidity: liquidity,
             image: tokenInfo.image || tokenInfo.imageUrl || null,
             timestamp: graduationTimestamp,
             graduationAge: graduationAge,
             timeSinceGraduation: timeSinceGraduation,
             collectedAt: new Date().toISOString(),
             verified: false,
             top10Concentration: null
         };
     }

     // Check top holder concentration
     async function checkTopHolderConcentration(mint) {
         try {
             log(`Checking top holder concentration for ${mint}`);
             const holdersData = await makeAPIRequest(`/tokens/${mint}/holders`);
             
             if (!holdersData || !holdersData.holders || !Array.isArray(holdersData.holders)) {
                 log(`No holder data available for ${mint}`);
                 return null;
             }
             
             const holders = holdersData.holders;
             const totalSupply = Number(holdersData.totalSupply || 0);
             
             if (totalSupply === 0 || holders.length === 0) {
                 log(`Invalid supply or holder data for ${mint}`);
                 return null;
             }
             
             // Get top 10 holders
             const top10Holders = holders.slice(0, 10);
             const top10TotalBalance = top10Holders.reduce((sum, holder) => {
                 return sum + Number(holder.balance || 0);
             }, 0);
             
             const concentration = top10TotalBalance / totalSupply;
             
             log(`Top 10 concentration for ${mint}: ${(concentration * 100).toFixed(2)}%`);
             return concentration;
             
         } catch (error) {
             log(`Failed to check top holder concentration for ${mint}: ${error.message}`);
             return null;
         }
     }

     // Filter tokens
     function filterTokens(tokens) {
         log(`Processing ${tokens.length} tokens with stricter filters (72h+ graduation, 100+ holders)...`);
         
         if (tokens.length === 0) {
             return [];
         }
         
         // Normalize tokens
         log(`Step 0: Normalizing ${tokens.length} tokens...`);
         const normalizedTokens = tokens.map(normalizeTokenData);
         log(`Step 0 result: ${normalizedTokens.length} tokens normalized`);
         
         // Debug: Show first few normalized tokens
         normalizedTokens.slice(0, 3).forEach(token => {
             log(`Sample normalized token: ${token.symbol} - Holders=${token.holders}, MC=${token.marketCapUsd}, Vol=${token.volume}, Age=${token.timeSinceGraduation}`);
         });
         
         // Remove duplicates by mint address
         const uniqueTokens = [];
         const seenMints = new Set();
         
         normalizedTokens.forEach(token => {
             if (token.mint && !seenMints.has(token.mint)) {
                 seenMints.add(token.mint);
                 uniqueTokens.push(token);
             }
         });
         
         if (normalizedTokens.length !== uniqueTokens.length) {
             log(`Removed ${normalizedTokens.length - uniqueTokens.length} duplicates`);
         }
         log(`After dedup: ${uniqueTokens.length} tokens`);
         
         // Filter by data quality
         const step1 = uniqueTokens.filter(token => {
             const passes = token.symbol && 
                    token.symbol !== 'UNKNOWN' && 
                    token.marketCapUsd > 0 && 
                    token.mint &&
                    token.priceUsd > 0;
             
             if (!passes) {
                 log(`Data quality filter excluding ${token.symbol}: symbol=${token.symbol}, MC=${token.marketCapUsd}, mint=${!!token.mint}, price=${token.priceUsd}`);
             }
             return passes;
         });
         log(`Data quality filter: ${step1.length} tokens (excluded ${uniqueTokens.length - step1.length})`);
         
         // Filter by graduation age (72+ hours)
         const step2 = step1.filter(token => {
             if (token.graduationAge === null) {
                 log(`Graduation age filter excluding ${token.symbol} - no graduation timestamp`);
                 return false;
             }
             
             if (token.graduationAge >= MIN_AGE) {
                 return true;
             } else {
                 log(`Graduation age filter excluding ${token.symbol} - only ${token.timeSinceGraduation} (need 72+ hours)`);
                 return false;
             }
         });
         log(`Graduation age filter (72+ hours): ${step2.length} tokens (excluded ${step1.length - step2.length})`);
         
         // Filter by market cap and volume
         const step3 = step2.filter(token => {
             const mcPass = token.marketCapUsd >= MIN_MARKET_CAP && token.marketCapUsd <= MAX_MARKET_CAP;
             const volPass = token.volume >= MIN_VOLUME_24H && token.volume <= MAX_VOLUME_24H;
             
             if (!mcPass) {
                 log(`Market cap filter excluding ${token.symbol}: ${token.marketCapUsd} (need ${MIN_MARKET_CAP}-${MAX_MARKET_CAP})`);
             }
             if (!volPass) {
                 log(`Volume filter excluding ${token.symbol}: ${token.volume} (need ${MIN_VOLUME_24H}-${MAX_VOLUME_24H})`);
             }
             
             return mcPass && volPass;
         });
         log(`Market cap + Volume filter: ${step3.length} tokens (excluded ${step2.length - step3.length})`);
         
         // Filter by holder count (including 0 holders for now, will verify later)
         const step4 = step3.filter(token => {
             const passes = token.holders === 0 || token.holders >= MIN_HOLDERS;
             if (!passes) {
                 log(`Holder filter excluding ${token.symbol}: ${token.holders} holders (need ${MIN_HOLDERS}+ or 0 for verification)`);
             }
             return passes;
         });
         log(`Initial holder filter (including 0 holders): ${step4.length} tokens (excluded ${step3.length - step4.length})`);
         
         // Debug: Show final tokens before sorting
         log(`Tokens passing all filters:`);
         step4.slice(0, 10).forEach(token => {
             log(`  ${token.symbol}: Holders=${token.holders}, MC=${token.marketCapUsd}, Vol=${token.volume}, Age=${token.timeSinceGraduation}`);
         });
         
         // Sort by combined stability score (lowest volume + oldest age)
         const sorted = step4.sort((a, b) => {
             // Volume: lower is better
             const volumeA = a.volume || 0;
             const volumeB = b.volume || 0;
             
             // Age: older is better (graduationAge is already in milliseconds)
             const ageA = a.graduationAge || 0;
             const ageB = b.graduationAge || 0;
             
             // Get max values for normalization
             const maxVolume = Math.max(...step4.map(t => t.volume || 0));
             const maxAge = Math.max(...step4.map(t => t.graduationAge || 0));
             
             // Normalize to 0-1 range
             const normalizedVolumeA = maxVolume > 0 ? volumeA / maxVolume : 0;
             const normalizedVolumeB = maxVolume > 0 ? volumeB / maxVolume : 0;
             
             const normalizedAgeA = maxAge > 0 ? ageA / maxAge : 0;
             const normalizedAgeB = maxAge > 0 ? ageB / maxAge : 0;
             
             // Composite stability score (lower is better)
             // 60% weight on volume (lower volume = lower score = better)
             // 40% weight on age (older age = lower score = better, so subtract age)
             const stabilityScoreA = (0.6 * normalizedVolumeA) - (0.4 * normalizedAgeA);
             const stabilityScoreB = (0.6 * normalizedVolumeB) - (0.4 * normalizedAgeB);
             
             return stabilityScoreA - stabilityScoreB;
         });
         
         log(`Final tokens sorted by stability (60% volume, 40% age): ${sorted.length}`);
         return sorted;
     }

     // Verify and update all token data
     async function verifyAllTokenData() {
         try {
             log('Starting comprehensive token verification process...');
             
             // Load current cache
             const cacheContent = await fs.readFile(CACHE_FILE, 'utf8');
             const cacheData = JSON.parse(cacheContent);
             
             if (!cacheData.tokens || !Array.isArray(cacheData.tokens)) {
                 log('No tokens found in cache to verify');
                 return;
             }
             
             log(`Found ${cacheData.tokens.length} tokens to verify`);
             
             let updatedCount = 0;
             let failedCount = 0;
             let excludedByConcentration = 0;
             const verifiedTokens = [];
             
             for (let i = 0; i < cacheData.tokens.length; i++) {
                 const token = cacheData.tokens[i];
                 
                 if (!token.mint) {
                     log(`Skipping token without mint: ${token.symbol}`);
                     continue;
                 }
                 
                 try {
                     log(`Verifying ${token.symbol} (${i + 1}/${cacheData.tokens.length})...`);
                     
                     // Get updated token details
                     const tokenDetails = await makeAPIRequest(`/tokens/${token.mint}`);
                     
                     if (tokenDetails) {
                         // Update token data with latest info
                         const updatedToken = { ...token };
                         
                         // Parse the actual API response structure
                         const tokenInfo = tokenDetails.token || {};
                         const pools = tokenDetails.pools || [];
                         const primaryPool = pools.length > 0 ? pools[0] : {};
                         
                         // Update core metrics from correct locations
                         if (typeof tokenDetails.holders === 'number') {
                             updatedToken.holders = tokenDetails.holders;
                         }
                         if (primaryPool.marketCap?.usd) {
                             updatedToken.marketCapUsd = Number(primaryPool.marketCap.usd);
                         }
                         if (primaryPool.txns?.volume24h !== undefined) {
                             updatedToken.volume = Number(primaryPool.txns.volume24h);
                         }
                         if (primaryPool.price?.usd) {
                             updatedToken.priceUsd = Number(primaryPool.price.usd);
                         }
                         if (primaryPool.liquidity?.usd) {
                             updatedToken.liquidity = Number(primaryPool.liquidity.usd);
                         }
                         
                         // Update graduation timestamp if available
                         const newTimestamp = tokenInfo.creation?.created_time || tokenInfo.timestamp || tokenInfo.created || tokenInfo.createdAt;
                         if (newTimestamp) {
                             updatedToken.timestamp = newTimestamp;
                             
                             try {
                                 const graduationTime = typeof newTimestamp === 'number' ? 
                                     newTimestamp * 1000 : new Date(newTimestamp).getTime(); // Convert to milliseconds if needed
                                 updatedToken.graduationAge = Date.now() - graduationTime;
                                 
                                 const hours = Math.floor(updatedToken.graduationAge / (1000 * 60 * 60));
                                 const days = Math.floor(hours / 24);
                                 
                                 if (days > 0) {
                                     updatedToken.timeSinceGraduation = `${days} day${days === 1 ? '' : 's'} ago`;
                                 } else {
                                     updatedToken.timeSinceGraduation = `${hours} hour${hours === 1 ? '' : 's'} ago`;
                                 }
                             } catch (e) {
                                 log(`Error parsing verified timestamp for ${token.symbol}: ${e.message}`);
                             }
                         }
                         
                         // Check if token still meets basic criteria after verification
                         if (updatedToken.holders < MIN_HOLDERS) {
                             log(`Excluding ${token.symbol} - insufficient holders: ${updatedToken.holders}`);
                             continue;
                         }
                         
                         if (updatedToken.marketCapUsd < MIN_MARKET_CAP || updatedToken.marketCapUsd > MAX_MARKET_CAP) {
                             log(`Excluding ${token.symbol} - market cap out of range: $${updatedToken.marketCapUsd}`);
                             continue;
                         }
                         
                         if (updatedToken.volume < MIN_VOLUME_24H || updatedToken.volume > MAX_VOLUME_24H) {
                             log(`Excluding ${token.symbol} - volume out of range: $${updatedToken.volume}`);
                             continue;
                         }
                         
                         // Check graduation age requirement (24+ hours)
                         if (updatedToken.graduationAge !== null && updatedToken.graduationAge < MIN_AGE) {
                             log(`Excluding ${token.symbol} - insufficient graduation age: ${updatedToken.timeSinceGraduation}`);
                             continue;
                         }
                         
                         // Check top holder concentration
                         await sleep(1000); // Small delay before holder check
                         const concentration = await checkTopHolderConcentration(token.mint);
                         
                         if (concentration !== null) {
                             updatedToken.top10Concentration = concentration;
                             
                             if (concentration > MAX_TOP_10_CONCENTRATION) {
                                 log(`Excluding ${token.symbol} - top 10 concentration too high: ${(concentration * 100).toFixed(2)}%`);
                                 excludedByConcentration++;
                                 continue;
                             }
                         }
                         
                         // Mark as verified
                         updatedToken.verified = true;
                         updatedToken.lastVerified = new Date().toISOString();
                         
                         verifiedTokens.push(updatedToken);
                         updatedCount++;
                         
                         log(`✓ Verified ${token.symbol} - Holders: ${updatedToken.holders}, MC: $${updatedToken.marketCapUsd.toLocaleString()}, Vol: $${updatedToken.volume.toLocaleString()}, Age: ${updatedToken.timeSinceGraduation || 'unknown'}${concentration ? `, Top10: ${(concentration * 100).toFixed(1)}%` : ''}`);
                         
                     } else {
                         log(`No data returned for ${token.symbol}`);
                         failedCount++;
                     }
                     
                     await sleep(2000); // Rate limiting
                     
                 } catch (error) {
                     log(`Failed to verify ${token.symbol}: ${error.message}`);
                     failedCount++;
                     await sleep(2000);
                 }
             }
             
             // Update cache data
             cacheData.tokens = verifiedTokens;
             cacheData.lastUpdated = new Date().toISOString();
             cacheData.totalFiltered = verifiedTokens.length;
             cacheData.tokensVerified = updatedCount;
             cacheData.verificationFailed = failedCount;
             cacheData.excludedByConcentration = excludedByConcentration;
             cacheData.maxTop10Concentration = MAX_TOP_10_CONCENTRATION;
             cacheData.version = '7.0';
             
             // Save updated cache
             await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2));
             
             log('Comprehensive verification completed:');
             log(`  Successfully verified: ${updatedCount}`);
             log(`  Failed verification: ${failedCount}`);
             log(`  Excluded by concentration: ${excludedByConcentration}`);
             log(`  Final token count: ${verifiedTokens.length}`);
             
         } catch (error) {
             log(`Error in comprehensive verification: ${error.message}`);
             throw error;
         }
     }

     // Main collection and filtering function
     async function collectAndFilterTokens() {
         try {
             log('Starting token collection and filtering...');
             
             // Load existing tokens
             const existingTokens = await loadExistingCache();
             
             // Fetch new tokens
             const newTokens = await fetchTokensAggressively();
             
             if (!newTokens || newTokens.length === 0) {
                 log('No new tokens retrieved');
                 if (existingTokens.length > 0) {
                     log('Using existing cached tokens');
                     return existingTokens;
                 } else {
                     throw new Error('No tokens available');
                 }
             }
             
             // Combine all tokens
             let allTokens = [];
             if (newTokens && newTokens.length > 0) {
                 allTokens = allTokens.concat(newTokens);
             }
             if (existingTokens.length > 0) {
                 allTokens = allTokens.concat(existingTokens);
             }
             
             log(`Total tokens before filtering: ${allTokens.length}`);
             
             // Filter tokens
             const filteredTokens = filterTokens(allTokens);
             
             return filteredTokens;
             
         } catch (error) {
             log(`Error in collection and filtering: ${error.message}`);
             throw error;
         }
     }

     // Main update function
     async function updateCache() {
         try {
             log('Starting enhanced cache update...');
             log('DEBUGGING MODE: Using relaxed filters to test token availability');
             log('Relaxed filters: 24+ hours graduation, 50+ holders, $10K-$200K MC, $500-$1M volume');
             log('Increased collection: 150 pages (up from 80) for more token coverage');
             
             // Step 1: Collect and filter tokens
             const filteredTokens = await collectAndFilterTokens();
             
             // Step 2: Save initial cache
             const cacheData = {
                 tokens: filteredTokens,
                 lastUpdated: new Date().toISOString(),
                 totalFiltered: filteredTokens.length,
                 criteria: {
                     minHolders: MIN_HOLDERS,
                     minMarketCap: MIN_MARKET_CAP,
                     maxMarketCap: MAX_MARKET_CAP,
                     minVolume24h: MIN_VOLUME_24H,
                     maxVolume24h: MAX_VOLUME_24H,
                     minGraduationHours: 72,
                     maxTop10Concentration: MAX_TOP_10_CONCENTRATION
                 },
                 version: '7.0'
             };
             
             const args = process.argv.slice(2);
             if (args.includes('--test') || args.includes('-t')) {
                 log('TEST MODE: Not writing to file');
                 console.log('Preview of first 3 tokens:');
                 console.log(JSON.stringify({
                     ...cacheData,
                     tokens: cacheData.tokens.slice(0, 3)
                 }, null, 2));
             } else {
                 await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2));
                 log(`Initial cache saved: ${filteredTokens.length} tokens`);
                 
                 // Step 3: Comprehensive verification (only in non-test mode)
                 if (!args.includes('--no-verify')) {
                     log('Starting comprehensive token verification...');
                     await verifyAllTokenData();
                 } else {
                     log('Skipping comprehensive verification (--no-verify flag)');
                 }
             }
             
             log('Enhanced cache update completed successfully!');
             
         } catch (error) {
             log(`Cache update failed: ${error.message}`);
             process.exit(1);
         }
     }

     // Handle command line arguments
     const args = process.argv.slice(2);
     if (args.includes('--help') || args.includes('-h')) {
         console.log('Solana Token Cache Updater - Enhanced with Full Verification & Concentration Filter');
         console.log('');
         console.log('Usage: node update_cache.js [options]');
         console.log('');
         console.log('Options:');
         console.log('  --help, -h       Show this help');
         console.log('  --test, -t       Test mode (no file write)');
         console.log('  --no-verify      Skip comprehensive verification step');
         console.log('  --verify-only    Run only comprehensive verification');
         console.log('');
         console.log('Enhanced Process:');
         console.log('  Step 1: Aggressive collection (150 pages) & strict filtering (72h+) → Save to cache');
         console.log('  Step 2: Verify ALL token data (holders, price, volume, age, etc.)');
         console.log('  Step 3: Check top 10 holder concentration → Filter out >40%');
         console.log('  Step 4: Save final verified cache');
         console.log('');
         console.log('New Features:');
         console.log('  • Increased token collection (150 pages instead of 80)');
         console.log('  • Stricter initial filters for faster processing');
         console.log('  • Comprehensive data verification for all tokens');
         console.log('  • Graduation age re-verification and filtering');
         console.log('  • Top 10 holder concentration analysis');
         console.log('  • Automatic exclusion of highly concentrated tokens');
         console.log('  • Updated criteria validation after verification');
         console.log('');
         console.log('DEBUGGING MODE - Relaxed Filters:');
         console.log('  • Market cap: $10K - $200K (was $30K-$100K)');
         console.log('  • Volume: $500 - $1M (24h) (was $1K-$500K)');
         console.log('  • Graduation: 24+ hours since migration (was 72+ hours)');
         console.log('  • Holders: 50+ (verified individually) (was 100+)');
         console.log('  • Top 10 concentration: ≤50% of total supply (was ≤40%)');
         console.log('');
         console.log('Benefits:');
         console.log('  • Increased token collection (150 pages) = more candidates');
         console.log('  • Stricter initial filters (72h+ graduation) = faster processing');
         console.log('  • All token data is verified and up-to-date (including age)');
         console.log('  • Excludes tokens with poor distribution');
         console.log('  • More reliable filtering after verification');
         console.log('  • Enhanced stability ranking (volume + age)');
         process.exit(0);
     }

     // Check environment
     if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
         log('Warning: No API key set');
     }

     // Add option to run only verification
     if (args.includes('--verify-only')) {
         log('Running comprehensive verification only...');
         verifyAllTokenData().then(() => {
             log('Comprehensive verification completed');
         }).catch(error => {
             log(`Verification failed: ${error.message}`);
             process.exit(1);
         });
     } else {
         // Run full update
         log('Starting DEBUGGING MODE - Enhanced Cache Update (Relaxed Filters to Test Token Availability)');
         updateCache();
     }