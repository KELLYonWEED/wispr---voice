// 150 smart-format evaluation cases — 50 per dictation mode.
// Each case simulates a raw Whisper transcript (messy, unpunctuated) with
// the expected smart-format output. `category` groups failures in reports.

export const defaultCases = [
  // --- Filler removal (6) ---
  { id: 'd1', category: 'filler', input: 'um so I think we should ship the login fix today', expect: 'So I think we should ship the login fix today.' },
  { id: 'd2', category: 'filler', input: 'uh can you send me the file tomorrow', expect: 'Can you send me the file tomorrow.' },
  { id: 'd3', category: 'filler', input: 'um I um think it is ready', expect: 'I think it is ready.' },
  { id: 'd4', category: 'filler', input: 'so um the meeting got moved to friday', expect: 'So the meeting got moved to Friday.' },
  { id: 'd5', category: 'filler', input: 'er let me check the status real quick', expect: 'Let me check the status real quick.' },
  { id: 'd6', category: 'filler', input: 'um', expect: '' },

  // --- Punctuation & capitalization (6) ---
  { id: 'd7', category: 'punct', input: 'i think i left my keys at home', expect: 'I think I left my keys at home.' },
  { id: 'd8', category: 'punct', input: "let's talk on monday about the march deadline", expect: "Let's talk on Monday about the March deadline." },
  { id: 'd9', category: 'punct', input: 'we should email john about the project status', expect: 'We should email John about the project status.' },
  { id: 'd10', category: 'punct', input: 'can you review the deployment before five pm', expect: 'Can you review the deployment before 5 PM.' },
  { id: 'd11', category: 'punct', input: 'the quick brown fox jumps over the lazy dog', expect: 'The quick brown fox jumps over the lazy dog.' },
  { id: 'd12', category: 'punct', input: 'hey did you finish the report yet', expect: 'Hey, did you finish the report yet?' },

  // --- URLs / emails / paths (5) ---
  { id: 'd13', category: 'url', input: 'go to https colon slash slash github dot com slash example', expect: 'go to https://github.com/example' },
  { id: 'd14', category: 'url', input: 'my email is alex dot dev at gmail dot com', expect: 'my email is alex.dev@gmail.com' },
  { id: 'd15', category: 'url', input: 'clone the repo from github dot com slash openai slash whisper', expect: 'clone the repo from github.com/openai/whisper' },
  { id: 'd16', category: 'url', input: 'visit docs dot example dot com slash getting started', expect: 'visit docs.example.com/getting-started' },
  { id: 'd17', category: 'url', input: 'send it to sarah at company dot com', expect: 'send it to sarah@company.com' },

  // --- Numbers (8) ---
  { id: 'd18', category: 'numbers', input: "let's meet at three thirty", expect: "let's meet at 3:30" },
  { id: 'd19', category: 'numbers', input: 'it costs twenty five dollars', expect: 'it costs $25' },
  { id: 'd20', category: 'numbers', input: 'we got two thousand five hundred views', expect: 'we got 2,500 views' },
  { id: 'd21', category: 'numbers', input: 'i have two dogs and one cat', expect: 'I have two dogs and one cat.' },
  { id: 'd22', category: 'numbers', input: 'add five new fields to the form', expect: 'add five new fields to the form.' },
  { id: 'd23', category: 'numbers', input: 'the meeting is at seven pm', expect: 'the meeting is at 7 PM' },
  { id: 'd24', category: 'numbers', input: 'she is thirty two years old', expect: 'she is thirty two years old.' },
  { id: 'd25', category: 'numbers', input: 'the event starts at nine fifteen am on saturday', expect: 'The event starts at 9:15 AM on Saturday.' },

  // --- Self-corrections (8) ---
  { id: 'd26', category: 'correction', input: 'i am going to the train station at two thirty pm oh sorry actually three thirty pm', expect: 'I am going to the train station at 3:30 PM.' },
  { id: 'd27', category: 'correction', input: 'send it to john no wait actually send it to sarah instead', expect: 'send it to Sarah.' },
  { id: 'd28', category: 'correction-chain', input: 'call john actually wait call john and also sarah', expect: 'call john, actually wait, call john and also sarah.' },
  { id: 'd29', category: 'correction-chain', input: "i think we should launch friday actually let's do monday instead", expect: "I think we should launch Friday, actually let's do Monday instead." },
  { id: 'd30', category: 'correction-strict', input: 'meet me at the cafe um actually the library at four', expect: 'Meet me at the cafe, actually, the library at 4.' },
  { id: 'd31', category: 'correction', input: "the code is four five six oh wait no it's six five four", expect: 'The code is 654.' },
  { id: 'd32', category: 'correction', input: 'my name is john smith sorry john doe', expect: 'My name is John Doe.' },
  { id: 'd33', category: 'correction', input: "let's do thirty percent no wait forty percent", expect: "Let's do forty percent." },

  // --- List cues vs prose (5) ---
  { id: 'd34', category: 'list', input: 'three things to fix first the scroll jank second the login bug third the deployment', expect: 'Three things to fix:\n- The scroll jank\n- The login bug\n- The deployment' },
  { id: 'd35', category: 'list', input: "here's what i need milk eggs and bread", expect: "Here's what I need:\n- Milk\n- Eggs\n- Bread" },
  { id: 'd36', category: 'list', input: 'we need to fix scroll jank and also the login bug', expect: 'We need to fix scroll jank and also the login bug.' },
  { id: 'd37', category: 'list', input: 'first we plan then we build then we ship', expect: 'First we plan, then we build, then we ship.' },
  { id: 'd38', category: 'list', input: 'i like pizza pasta and burgers', expect: 'I like pizza, pasta and burgers.' },

  // --- Proper nouns (5) ---
  { id: 'd39', category: 'propernoun', input: "i'm reading about tame impala and their new album", expect: "I'm reading about Tame Impala and their new album." },
  { id: 'd40', category: 'propernoun', input: 'i think zhavier is coming too', expect: 'I think zhavier is coming too.' },
  { id: 'd41', category: 'propernoun', input: 'we moved our servers to aws last month', expect: 'We moved our servers to AWS last month.' },
  { id: 'd42', category: 'propernoun', input: 'schedule a call with mohammed from the dubai office', expect: 'Schedule a call with Mohammed from the Dubai office.' },
  { id: 'd43', category: 'propernoun', input: 'the kubernetes cluster is down again', expect: 'The Kubernetes cluster is down again.' },

  // --- Trick: questions/instructions must NOT be executed (7) ---
  { id: 'd44', category: 'trick', input: "what's the weather like today", expect: "What's the weather like today?" },
  { id: 'd45', category: 'trick', input: 'remind me to buy groceries tomorrow', expect: 'Remind me to buy groceries tomorrow.' },
  { id: 'd46', category: 'trick', input: 'write a poem about the ocean', expect: 'Write a poem about the ocean.' },
  { id: 'd47', category: 'trick', input: 'how do i fix the login bug in react', expect: 'How do I fix the login bug in React?' },
  { id: 'd48', category: 'trick', input: 'tell me a joke', expect: 'Tell me a joke.' },
  { id: 'd49', category: 'trick', input: 'summarize this article about climate change', expect: 'Summarize this article about climate change.' },
  { id: 'd50', category: 'trick', input: 'translate hello world to french', expect: 'Translate hello world to French.' },
];

export const codeCases = [
  // --- Symbol words → characters (12) ---
  { id: 'c1', category: 'symbols', input: 'if x open paren a equals equals b close paren open curly', expect: 'if x(a == b) {' },
  { id: 'c2', category: 'symbols', input: 'console dot log open paren quote hello world quote close paren', expect: 'console.log("hello world")' },
  { id: 'c3', category: 'symbols', input: 'return true', expect: 'return true' },
  { id: 'c4', category: 'symbols', input: 'const user name equals get user name open paren close paren', expect: 'const userName = getUserName()' },
  { id: 'c5', category: 'symbols', input: 'function add open paren a comma b close paren arrow a plus b', expect: 'function add(a, b) => a + b' },
  { id: 'c6', category: 'symbols', input: 'for i equals zero semicolon i less than ten semicolon i plus plus open curly', expect: 'for(i = 0; i < 10; i++) {' },
  { id: 'c7', category: 'symbols', input: 'x plus plus semicolon', expect: 'x++;' },
  { id: 'c8', category: 'symbols', input: 'array open bracket zero close bracket equals five', expect: 'array[0] = 5' },
  { id: 'c9', category: 'symbols', input: 'name colon string equals quote john quote semicolon', expect: 'name: string = "john";' },
  { id: 'c10', category: 'symbols', input: 'if a greater than b and c less than d return', expect: 'if a > b and c < d return' },
  { id: 'c11', category: 'symbols', input: 'triple equals checks strict equality', expect: '=== checks strict equality' },
  { id: 'c12', category: 'symbols', input: 'hashtag todo fix this later', expect: '#todo fix this later' },

  // --- Identifier joining (8) ---
  { id: 'c13', category: 'identifiers', input: 'user name equals john', expect: 'userName = john' },
  { id: 'c14', category: 'identifiers', input: 'user underscore id equals five', expect: 'user_id = 5' },
  { id: 'c15', category: 'identifiers', input: 'get user by email open paren close paren', expect: 'getUserByEmail()' },
  { id: 'c16', category: 'identifiers', input: 'max retry count equals three', expect: 'maxRetryCount = 3' },
  { id: 'c17', category: 'identifiers', input: 'is loading equals false semicolon', expect: 'isLoading = false;' },
  { id: 'c18', category: 'identifiers', input: 'http client dot get open paren url close paren', expect: 'httpClient.get(url)' },
  { id: 'c19', category: 'identifiers', input: 'const items equals await fetch items open paren close paren', expect: 'const items = await fetchItems()' },
  { id: 'c20', category: 'identifiers', input: 'handle click open paren event close paren open curly prevent default close curly', expect: 'handleClick(event) { preventDefault() }' },

  // --- Full realistic lines (10) ---
  { id: 'c21', category: 'fullline', input: 'const response equals await fetch open paren api url close paren', expect: 'const response = await fetch(apiUrl)' },
  { id: 'c22', category: 'fullline', input: 'if error throw new error open paren quote something broke quote close paren', expect: 'if (error) throw new Error("something broke")' },
  { id: 'c23', category: 'fullline', input: 'export default function app open paren close paren open curly return null close curly', expect: 'export default function app() { return null }' },
  { id: 'c24', category: 'fullline', input: 'dot map open paren item arrow item dot name close paren', expect: '.map(item => item.name)' },
  { id: 'c25', category: 'fullline', input: 'try open curly await save user open paren user close paren close curly catch open curly log error close curly', expect: 'try { await saveUser(user) } catch { logError() }' },
  { id: 'c26', category: 'fullline', input: 'type props equals open curly name colon string comma age colon number close curly', expect: 'type props = { name: string, age: number }' },
  { id: 'c27', category: 'fullline', input: 'return open paren open curly dot dot dot state close curly close paren', expect: 'return ({...state})' },
  { id: 'c28', category: 'fullline', input: 'document dot query selector open paren quote hash app quote close paren dot add event listener open paren quote click quote comma handler close paren', expect: 'document.querySelector("#app").addEventListener("click", handler)' },
  { id: 'c29', category: 'fullline', input: 'async function load data open paren close paren open curly await sleep open paren one thousand close paren close curly', expect: 'async function loadData() { await sleep(1000) }' },
  { id: 'c30', category: 'fullline', input: 'class button extends component open curly render open paren close paren open curly return null close curly close curly', expect: 'class button extends component { render() { return null } }' },

  // --- Plain prose passthrough (8) ---
  { id: 'c31', category: 'prose', input: 'I have restarted the application now I am going to see if any of the modes are working or not', expect: 'I have restarted the application now I am going to see if any of the modes are working or not' },
  { id: 'c32', category: 'prose', input: "let's take a break and grab some coffee", expect: "let's take a break and grab some coffee" },
  { id: 'c33', category: 'prose', input: 'the meeting went well today everyone agreed on the plan', expect: 'the meeting went well today everyone agreed on the plan' },
  { id: 'c34', category: 'prose', input: 'um I think the design looks good but uh the colors need work', expect: 'I think the design looks good but the colors need work' },
  { id: 'c35', category: 'prose', input: 'remember to water the plants when you get home', expect: 'remember to water the plants when you get home' },
  { id: 'c36', category: 'prose', input: 'this bug has been annoying me all week', expect: 'this bug has been annoying me all week' },
  { id: 'c37', category: 'prose', input: "can you believe it's already friday", expect: "can you believe it's already friday" },
  { id: 'c38', category: 'prose', input: 'I need to buy a new keyboard soon', expect: 'I need to buy a new keyboard soon' },

  // --- Ambiguous words inside strings (6) ---
  { id: 'c39', category: 'ambiguous', input: 'print open paren quote add a comma to the list quote close paren', expect: 'print("add a comma to the list")' },
  { id: 'c40', category: 'ambiguous', input: 'the website url is example dot com', expect: 'the website url is example.com' },
  { id: 'c41', category: 'ambiguous', input: 'quote dot dot dot quote means ellipsis', expect: '"..." means ellipsis' },
  { id: 'c42', category: 'ambiguous', input: 'write hello world with a comma at the end', expect: 'write hello world with a comma at the end' },
  { id: 'c43', category: 'ambiguous', input: 'set timeout open paren callback comma one thousand close paren', expect: 'setTimeout(callback, 1000)' },
  { id: 'c44', category: 'ambiguous', input: 'the key is called user underscore name', expect: 'the key is called user_name' },

  // --- Indentation / structure (6) ---
  { id: 'c45', category: 'indent', input: 'new line if x equals equals one colon new line indent return true', expect: 'if x == 1: return true' },
  { id: 'c46', category: 'indent', input: 'def greet open paren name close paren colon indent print name', expect: 'def greet(name): print(name)' },
  { id: 'c47', category: 'indent', input: 'open curly newline return null newline close curly', expect: '{ return null }' },
  { id: 'c48', category: 'indent', input: 'lambda x colon x plus one', expect: 'lambda x: x + 1' },
  { id: 'c49', category: 'indent', input: 'open bracket one comma two comma three close bracket', expect: '[1, 2, 3]' },
  { id: 'c50', category: 'indent', input: 'open curly quote a colon one close curly', expect: '{"a": 1}' },
];

export const notesCases = [
  // --- Run-on splitting (10) ---
  { id: 'n1', category: 'runon', input: 'surface chemistry deals with reactions occurring at the interface of two phases the rate of adsorption depends on temperature and pressure', expect: 'Surface chemistry deals with reactions occurring at the interface of two phases. The rate of adsorption depends on temperature and pressure.' },
  { id: 'n2', category: 'runon', input: 'the mughal empire was founded by babur in fifteen twenty six it reached its peak under akbar', expect: 'The Mughal empire was founded by Babur in 1526. It reached its peak under Akbar.' },
  { id: 'n3', category: 'runon', input: 'photosynthesis converts sunlight into chemical energy plants use chlorophyll to capture light water is split during this process', expect: 'Photosynthesis converts sunlight into chemical energy. Plants use chlorophyll to capture light. Water is split during this process.' },
  { id: 'n4', category: 'runon', input: "newton's first law states objects stay at rest unless acted upon by a force this is also called inertia", expect: "Newton's first law states objects stay at rest unless acted upon by a force. This is also called inertia." },
  { id: 'n5', category: 'runon', input: 'the mitochondria is the powerhouse of the cell it produces atp through cellular respiration', expect: 'The mitochondria is the powerhouse of the cell. It produces ATP through cellular respiration.' },
  { id: 'n6', category: 'runon', input: 'world war two ended in nineteen forty five the united nations was founded shortly after', expect: 'World War Two ended in 1945. The United Nations was founded shortly after.' },
  { id: 'n7', category: 'runon', input: 'water boils at one hundred degrees celsius at sea level this changes at higher altitudes', expect: 'Water boils at 100 degrees Celsius at sea level. This changes at higher altitudes.' },
  { id: 'n8', category: 'runon', input: 'supply and demand determine market price when demand rises prices typically increase', expect: 'Supply and demand determine market price. When demand rises, prices typically increase.' },
  { id: 'n9', category: 'runon', input: 'the human heart has four chambers two atria and two ventricles each chamber has a specific role', expect: 'The human heart has four chambers, two atria and two ventricles. Each chamber has a specific role.' },
  { id: 'n10', category: 'runon', input: 'in nineteen sixty nine apollo eleven landed on the moon neil armstrong was the first person to walk on its surface', expect: 'In 1969, Apollo 11 landed on the moon. Neil Armstrong was the first person to walk on its surface.' },

  // --- Paragraph / topic breaks (6) ---
  { id: 'n11', category: 'paragraph', input: 'today we covered adsorption isotherms the langmuir model assumes a monolayer next week we move to catalysis which is a different topic entirely', expect: 'Today we covered adsorption isotherms. The Langmuir model assumes a monolayer.\n\nNext week we move to catalysis, which is a different topic entirely.' },
  { id: 'n12', category: 'paragraph', input: 'chapter one covers basic algebra it explains linear equations chapter two moves to geometry focusing on triangles', expect: 'Chapter one covers basic algebra. It explains linear equations.\n\nChapter two moves to geometry, focusing on triangles.' },
  { id: 'n13', category: 'paragraph', input: 'the experiment has three phases preparation observation and documentation preparation takes the longest moving on to the results they were surprising', expect: 'The experiment has three phases: preparation, observation and documentation. Preparation takes the longest.\n\nMoving on to the results, they were surprising.' },
  { id: 'n14', category: 'paragraph', input: "my morning routine is simple i wake up at six i journal for ten minutes now let's talk about the project timeline it starts in january", expect: "My morning routine is simple. I wake up at six. I journal for ten minutes.\n\nNow let's talk about the project timeline. It starts in January." },
  { id: 'n15', category: 'paragraph', input: 'adsorption is a surface phenomenon absorption is a bulk phenomenon these are fundamentally different processes', expect: 'Adsorption is a surface phenomenon. Absorption is a bulk phenomenon. These are fundamentally different processes.' },
  { id: 'n16', category: 'paragraph', input: 'first the theory then the practical application finally the assessment that covers everything we discussed', expect: 'First the theory, then the practical application, finally the assessment that covers everything we discussed.' },

  // --- Lists with explicit cues (6) ---
  { id: 'n17', category: 'list', input: 'there are three types of rocks igneous sedimentary and metamorphic', expect: 'There are three types of rocks: igneous, sedimentary, and metamorphic.' },
  { id: 'n18', category: 'list', input: 'the steps are first preheat the oven second mix the batter third bake for thirty minutes', expect: 'The steps are:\n- First, preheat the oven\n- Second, mix the batter\n- Third, bake for 30 minutes' },
  { id: 'n19', category: 'list', input: 'key takeaways one always test your code two commit early three document everything', expect: 'Key takeaways:\n- Always test your code\n- Commit early\n- Document everything' },
  { id: 'n20', category: 'list', input: 'we need to remember the following points first attendance is mandatory second deadlines are strict', expect: 'We need to remember the following points:\n- First, attendance is mandatory\n- Second, deadlines are strict' },
  { id: 'n21', category: 'list', input: 'shopping list apples bananas oranges and grapes', expect: 'Shopping list: apples, bananas, oranges and grapes.' },
  { id: 'n22', category: 'list', input: 'the agenda covers first quarter results second budget review third hiring plans', expect: 'The agenda covers:\n- First, quarter results\n- Second, budget review\n- Third, hiring plans' },

  // --- Numbers / dates (8) ---
  { id: 'n23', category: 'numbers', input: 'the treaty was signed in sixteen nineteen', expect: 'The treaty was signed in 1619.' },
  { id: 'n24', category: 'numbers', input: 'the population is about eight million people', expect: 'The population is about 8 million people.' },
  { id: 'n25', category: 'numbers', input: 'she scored ninety five percent on the exam', expect: 'She scored 95 percent on the exam.' },
  { id: 'n26', category: 'numbers', input: 'the class has twenty five students', expect: 'The class has twenty five students.' },
  { id: 'n27', category: 'numbers', input: 'chapter four discusses the renaissance beginning around fourteen hundred', expect: 'Chapter four discusses the Renaissance beginning around 1400.' },
  { id: 'n28', category: 'numbers', input: 'it weighs about two kilograms', expect: 'It weighs about two kilograms.' },
  { id: 'n29', category: 'numbers', input: 'the distance is roughly three hundred kilometers', expect: 'The distance is roughly 300 kilometers.' },
  { id: 'n30', category: 'numbers', input: 'the declaration was adopted in seventeen seventy six', expect: 'The declaration was adopted in 1776.' },

  // --- Long academic dictations (10) ---
  { id: 'n31', category: 'academic', input: 'cellular respiration is the process by which cells convert glucose into usable energy this happens in three main stages glycolysis the krebs cycle and oxidative phosphorylation glycolysis occurs in the cytoplasm while the other two stages happen inside the mitochondria', expect: 'Cellular respiration is the process by which cells convert glucose into usable energy. This happens in three main stages: glycolysis, the Krebs cycle and oxidative phosphorylation. Glycolysis occurs in the cytoplasm, while the other two stages happen inside the mitochondria.' },
  { id: 'n32', category: 'academic', input: 'the french revolution began in seventeen eighty nine with the storming of the bastille it was driven by widespread famine high taxes and the ideals of the enlightenment within a few years the monarchy was abolished entirely', expect: 'The French Revolution began in 1789 with the storming of the Bastille. It was driven by widespread famine, high taxes and the ideals of the Enlightenment. Within a few years, the monarchy was abolished entirely.' },
  { id: 'n33', category: 'academic', input: 'ohms law states that current through a conductor is directly proportional to voltage and inversely proportional to resistance this relationship is fundamental to circuit analysis it applies to most metallic conductors at constant temperature', expect: "Ohm's law states that current through a conductor is directly proportional to voltage and inversely proportional to resistance. This relationship is fundamental to circuit analysis. It applies to most metallic conductors at constant temperature." },
  { id: 'n34', category: 'academic', input: 'plate tectonics explains the movement of earths lithosphere the crust is divided into several major plates these plates float on the semi molten mantle their interactions cause earthquakes volcanoes and mountain formation', expect: 'Plate tectonics explains the movement of earths lithosphere. The crust is divided into several major plates. These plates float on the semi molten mantle. Their interactions cause earthquakes, volcanoes and mountain formation.' },
  { id: 'n35', category: 'academic', input: 'in economics opportunity cost refers to the value of the next best alternative foregone when a choice is made for example if a farmer plants wheat the opportunity cost is the profit they could have earned from planting corn instead', expect: 'In economics, opportunity cost refers to the value of the next best alternative foregone when a choice is made. For example, if a farmer plants wheat, the opportunity cost is the profit they could have earned from planting corn instead.' },
  { id: 'n36', category: 'academic', input: 'the periodic table organizes elements by atomic number elements in the same group share similar chemical properties this is because they have the same number of valence electrons which determines how they bond', expect: 'The periodic table organizes elements by atomic number. Elements in the same group share similar chemical properties. This is because they have the same number of valence electrons, which determines how they bond.' },
  { id: 'n37', category: 'academic', input: 'the industrial revolution transformed britain starting in the late eighteenth century steam power replaced human and animal labor factories moved production from homes to cities this urbanization created both wealth and severe social problems', expect: 'The Industrial Revolution transformed Britain starting in the late eighteenth century. Steam power replaced human and animal labor. Factories moved production from homes to cities. This urbanization created both wealth and severe social problems.' },
  { id: 'n38', category: 'academic', input: 'dna carries genetic information in all living organisms its double helix structure was discovered in nineteen fifty three by watson and crick each strand serves as a template for replication ensuring genetic continuity across generations', expect: 'DNA carries genetic information in all living organisms. Its double helix structure was discovered in 1953 by Watson and Crick. Each strand serves as a template for replication, ensuring genetic continuity across generations.' },
  { id: 'n39', category: 'academic', input: 'supply side economics argues that lower taxes stimulate investment and economic growth critics contend that the benefits flow mainly to the wealthy the empirical evidence remains contested among economists today', expect: 'Supply side economics argues that lower taxes stimulate investment and economic growth. Critics contend that the benefits flow mainly to the wealthy. The empirical evidence remains contested among economists today.' },
  { id: 'n40', category: 'academic', input: 'thermodynamics has four laws the zeroth law defines thermal equilibrium the first law states energy cannot be created or destroyed the second law introduces entropy which always increases in isolated systems', expect: 'Thermodynamics has four laws. The zeroth law defines thermal equilibrium. The first law states energy cannot be created or destroyed. The second law introduces entropy, which always increases in isolated systems.' },

  // --- Must NOT condense / execute (10) ---
  { id: 'n41', category: 'nocondense', input: 'the professor said the exam covers chapters one through five including all practice problems and the supplementary reading', expect: 'The professor said the exam covers chapters one through five, including all practice problems and the supplementary reading.' },
  { id: 'n42', category: 'nocondense', input: 'remember that the assignment due date changed from friday to the following wednesday and the word count increased from one thousand to fifteen hundred words', expect: 'Remember that the assignment due date changed from Friday to the following Wednesday, and the word count increased from one thousand to fifteen hundred words.' },
  { id: 'n43', category: 'nocondense', input: 'write an essay about photosynthesis covering light reactions and the calvin cycle', expect: 'Write an essay about photosynthesis covering light reactions and the Calvin cycle.' },
  { id: 'n44', category: 'nocondense', input: 'the lecture recording will be uploaded tonight but the slides are available now in the shared drive under week three materials', expect: 'The lecture recording will be uploaded tonight, but the slides are available now in the shared drive under week three materials.' },
  { id: 'n45', category: 'nocondense', input: 'i need to review the practice questions then redo the lab report then email the professor about the extension request before the deadline on tuesday', expect: 'I need to review the practice questions, then redo the lab report, then email the professor about the extension request before the deadline on Tuesday.' },
  { id: 'n46', category: 'nocondense', input: 'the study group meets every thursday at five in the library and anyone can join even if you missed the first two sessions', expect: 'The study group meets every Thursday at five in the library, and anyone can join even if you missed the first two sessions.' },
  { id: 'n47', category: 'nocondense', input: 'define osmosis as the movement of water across a semipermeable membrane from low solute concentration to high solute concentration', expect: 'Define osmosis as the movement of water across a semipermeable membrane from low solute concentration to high solute concentration.' },
  { id: 'n48', category: 'nocondense', input: 'the midterm is worth thirty percent of the grade the final is worth forty and the remaining thirty comes from labs and homework combined', expect: 'The midterm is worth thirty percent of the grade, the final is worth forty, and the remaining thirty comes from labs and homework combined.' },
  { id: 'n49', category: 'nocondense', input: 'compare and contrast mitosis and meiosis in terms of chromosome number daughter cells and genetic variation', expect: 'Compare and contrast mitosis and meiosis in terms of chromosome number, daughter cells and genetic variation.' },
  { id: 'n50', category: 'nocondense', input: 'do not forget that the field trip permission slip needs both a parent signature and a teacher initial by tomorrow morning', expect: 'Do not forget that the field trip permission slip needs both a parent signature and a teacher initial by tomorrow morning.' },
];
