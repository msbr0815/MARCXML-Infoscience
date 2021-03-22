{
    "translatorID": "52aaf830-cc46-496d-b476-cf16b58191ae",
    "label": "MARC21XML-Infoscience v1.5",
    "creator": "Philipp Zumstein (original version: 'zotkat'), Matthias Bräuninger (tailoring to EPFL), Alain Borel (Infoscience-based improvements)",
    "target": "xml",
    "minVersion": "3.0",
    "maxVersion": "",
    "priority": 100,
    "displayOptions": {
        "exportNotes": true,
        "Include abstract": true,
		"Batch identifier": true,
		"Validated records": false
    },
    "inRepository": true,
    "translatorType": 2,
    "browserSupport": "g",
    "lastUpdated": "2021-03-22, 14:51:00"
}

/*
 * * * * * * * * * * * * * *
 * Renewal programme (roadmap for 2.0)
 * * * * * * * * * * * * * *
 *
 * Input: Zotero data item (json format)
 * Output: Infoscience item (MARCXML format)
 * 
 * 1. Assemble all information in a javascript object (map allows for key-value pairs)
 * 1.a	Obtain, clean and store information from zotero object in the js object
 * 1.b	Add information not in zotero object (e. g., server-side information) to the js object
 * 2. Translate javascript object to XML file
 * 
 * 1.	TO DO	Define data object (Map) for every record that accepts the cleaned data coming
 *				from the input (zotero item) and from the server. A key represents a MARC
 *				datafield identifier concatenated with its indicators, its corresponding value
 * 				the subfield. The subfield keys are the MARC tags, the corresponding values are
 * 				the metadata.
 * 1.a	TO DO	For every record item from Zotero, extract the metadata from the input, clean 
 *				and add them to the subfield map as required (key: subfield index, value:
 * 				metadata). If the MARC field needs to be repeated n times, e. g. in the case of
 * 				authors or identifiers, create a Set of n subfield Maps instead of a Map.
 * 1.b	TO DO	Add the common information extracted from the server to the common-data entry
 * 				and then to every record.
 * 2. 	TO DO	Translate the global object into an output file whose format (MARCXML, JSON,
 * 				...) is hardcoded in the translator and which can be chosen when exporting the
 * 				data routine. This essentially creates a blueprint for defining several
 * 				translators.
 *
 * Gradually change translator into new model, starting from v1.5:
 * A:	DONE	Bring all routines working on the input item's fields into the same
 *				form:
 *					INPUT DATA -> clean -> transform -> OUTPUT DATA
 *				Keep text export for now, but transform into a function.
 * B:	DONE	Change text export functions into more general form that can handle
 *				the global data object.
 * C:	DONE	Test 1.5 on several test cases
 */

const debugMarker = "----------------------------\n";

/*
 Z.debug(debugMarker);
 Z.debug("Check routines:");
 Z.debug("020__: Field created but no subfields.");
 Z.debug("022__: Field created but no subfields.");
 Z.debug("02470: Field created and filled. Subfield code is set as 'DOI', but should be 'a'. Malformed data item.");
 Z.debug("773__: Field created but no subfields.");
 Z.debug(debugMarker);
 */

/***************************************
 *             Variables
 ***************************************/

var recordNode;
var itemCounter = 0;

var recordLength;
var countFields = { 'controlfield': 0, 'datafield': 0, 'subfield': 0 };
var ns = "http://www.loc.gov/MARC21/slim";
var xmlDocument;

//Excluded doctypes
const EXCLUDED = new Set(["thesis", "presentation", "patent"]);

const typeMap = {
    //default value "a" for every written text is taken (e.g. for book, article, report, webpage,...), everything else should be declared here
    "artwork": "k",
    "audioRecording": "j",
    "computerProgram": "m",
    "film": "g",
    "manuscript": "t",
    "map": "e", //"f" is normally less likely
    "podcast": "i",
    "presentation": "a", //slides -> a, speech -> i
    "radioBroadcast": "i",
    "tvBroadcast": "g",
    "videoRecording": "g"
};

//very probably unused: 008 is not in Infoscience 2
const secondTypeMap = { //based on 008/24-27
    "patent": "j",
    "statute": "l",
    "case": "v"
};

const pubSourceMap = { //key contains Zotero entry in "extra" ; value contains Infoscience entry in 024702
    "doi": "DOI", //was uppercase
    "wos": "ISI", //was uppercase
    //"Scopus" : "ScopusID", // Ignore for the moment: ScopusID doesn't show in Zotero
    "pmid": "PMID", //was uppercase
    "arxiv": "arXiv"
};


/***************************************
 *             Functions
 ***************************************/

function fillZerosLeft(text, size) {
    if (!text) text = '';
    if (typeof text == 'number') text = text.toString();
    missingCharacters = size - text.length;
    if (missingCharacters > 0) {
        text = Array(missingCharacters + 1).join('0') + text;
    }
    return text;
}

function marcConformal(marcTag) {
	let conformal = true;
	if (marcTag.match(/\s/)) {
		Z.debug(`Please replace whitespaces by '_' in your MARC tags (${marcTag}).`); //Error prevention: A sequence of underscores is easier to count when looking at the code.
		return false;
	}
	if (marcTag.length > 5) {
		conformal = false;
		Z.debug(`MARC tag too long: ${marcTag}. Trying first five characters...`);
		if (!marcTag.substring(0,5).match(/^\d{3}[a-z0-9_]{2}$/)) {
			Z.debug(`Malformed MARC tag: ${marcTag}.`);
		} else {
			Z.debug("Trimming seems to help. Change your source code by removing the subfields.");
		}
	}
	return conformal;
}

//Combined ISBN and ISSN cleaning function
//:param rawData:	string		String read from Zotero
//Can be improved: Add hyphens if none are available
function cleanISxN(rawData) {
	//Create the output objects
	var isxn = new Set();
	let trimData = rawData.trim(); //remove leading and trailig whitespaces first, just to be on the safe side
	//Z.debug(`trimData: ${trimData}`);
	//Code uses variables in case Zotero's standard changes
	const ISSNSEP = ", ";//ISSNs are separated by a comma + whitespace in Zotero
	const ISBNSEP = " ";//ISBNs are separated by a whitespace in Zotero
	list = [];
	if (trimData.search(ISSNSEP) !== -1) { //comma + whitespace found: ISSN
		list = trimData.split(ISSNSEP); //Add set (unique values) to data object
	} else if (trimData.indexOf(ISBNSEP) !== -1) { //Whitespace only: ISBN
		list = trimData.split(ISBNSEP); //Add set (unique values) to data object
	} else {
		list = [trimData]; //Add string to data object
	}
	//Quick debug
	/*
	for (let item in list) {
		Z.debug(`ISBN/ISSN found: ${list[item]}`);
	}*/
	for (item in list) {
		var data = new Map();//Create a Map object for every ISBN or ISSN found
		data.set('a', list[item]);
		isxn.add(data);//Add data item to set
	}
	return isxn;
}

//INFO: Zotero's "libraryCatalog" holds information about the archive (Scopus, PubMed, Web of knowledge, ...). Useful?
//Check "Extra" field for identifiers and add them to the MARC field if found
//:param thisItem:	object		Current item from which the Extra and DOI fields are extracted
function getExtraIdentifiers(thisItem) {
	//Check all lines of the "Extra" field and check if allowed idintifiers are found.
	//Allowed identifiers are in the pubSourceMap object
	let extraContent = [];
	if (thisItem.extra.match("\n")) {
		extraContent = thisItem.extra.split("\n");
		//Check the line for all keys in pubSourceMap
	} else {
		extraContent.push(thisItem.extra);
	}
	//IMPROVE: Check for pattern before attempting to split string into arrays
	let patt = /[:]\s?/;
	//We need to store the identifiers somewhere
	var identifiers = new Set();
	for (var i = 0; i < extraContent.length; i++) {
		if (!(extraContent[i].match(patt))) {
			Z.debug("No identifier found. Skipping.");
			return;
		}
		let idType = extraContent[i].split(patt)[0].trim();
		let idEntry = extraContent[i].split(patt)[1].trim();
		//Z.debug(`Possible identifier found (key: ${idType}, value: ${idEntry}).`);
		if(thisItem.DOI && idType.toLowerCase() == "doi") {
			//Z.debug("Skipping DOI.");
			continue;
		}
		//Debug:
		/*
		for(key in pubSourceMap) {
			Z.debug(`key: ${key}`);
		}*/
		//if (pubSourceMap.has(idType)) {//Use this if pubSourceMap is an actual map :)
		if (idType.toLowerCase() in pubSourceMap) {
			var data = new Map();
			//Z.debug(`Valid identifier ${idEntry} (type ${idType}) found.`);
			data.set('a', idType);
			data.set('2', idEntry);
			identifiers.add(data);
		}
	}
	//Z.debug(`Set size: ${identifiers.size}.`);// Array size: ${identifiersArr.length}.`);
	return identifiers;
}

// @property can either be a string which will be attachad as a textNode
// or just the Boolean "true" which will then just create the nodes
// without any content
function mapProperty(parentElement, elementName, attributes, property) {
    if (!property) return null;
    //var xmlDocument = parentElement.ownerDocument,
	//newElement = xmlDocument.createElementNS(ns, elementName);
	var newElement = xmlDocument.createElementNS(ns, elementName);
    if (attributes) {
        for (let i in attributes) {
            newElement.setAttribute(i, attributes[i]);
        }
    }
    if (property && (typeof property == 'string' || typeof property == 'number')) {
        newElement.appendChild(xmlDocument.createTextNode(property));
        recordLength += property.toString().length;
    }
    countFields[elementName]++; //for calculating the record length
    parentElement.appendChild(newElement);
    return newElement;
}

//Adds subfields and their data to the current node.
//:param marcTag:	string		MARC tag and identifiers of the current field. Must not contain subfield!
//:param entry:		string		Data for the control field
//:return:			Object		
function addControlField(marcTag, entry) {
	return mapProperty(recordNode, "controlfield", { "tag": marcTag }, entry);
}

//Adds subfields and their data to the current node.
//:param marcTag:	string		MARC tag and identifiers of the current field. Must not contain subfield!
//:param data:		Map			Data for the MARC field given by marcTag
function dataMapToOutput(marcTag, data) {
	currentFieldNode = mapProperty(recordNode, "datafield", { "tag": marcTag.substring(0,3), "ind1": marcTag.charAt(3), "ind2": marcTag.charAt(4) }, true);
	//run through Map object
	for (let [subID, value] of data) {
		//Check if the key-value pair is of the proper format
		if ((typeof subID == 'string') && (typeof value == 'string')) {
			mapProperty(currentFieldNode, "subfield", { "code": subID }, value);
		} else {
			Z.debug(`The subID (${subID}) and value (${value}) aren't strings.`);
			continue;
		}
		
	}
}

//STATE: Completed. To be tested and deployed.
//Adds subfields and their data to the current node.
//:param marcTag:	string		MARC tag and identifiers of the current field. Must not contain subfield!
//:param data:		Set	or Map	Subfield IDs and contents, either as Map (most data types) or as Set (repetition of the same MARC field: identifiers or authors)
function addDataField(marcTag, data) {
	//Z.debug(debugMarker);
	//Z.debug("addDataField start.");
	//Check if a marcTag has been passed
	if (marcTag == null) {
		Z.debug(`No marcTag given. Skipped.`);
		return;
	}
	//Check if the MARC tag is well-formed
	if (!marcConformal(marcTag)) {
		Z.debug(`Non-conformal MARC field found: ${marcTag}. Skipped.`);
		return;//or break?
	}
	marcTag = marcTag.replace(/_/g, " ");//Replace the underscores by spaces
	//Check if a data object has been passed
	if (data == null) {
		Z.debug(`No data given in ${marcTag}. Skipped.`);
		return;
	}
	//Check if the data is not empty
	if (data.size == 0) {
		Z.debug(`Size error in ${marcTag}: Data object is of Size 0. Aborted.`);
		return;
	}
	if (data instanceof Map) { //Case 1/2: data is a Map object
		//add key-value pairs of Map
		dataMapToOutput(marcTag, data);
		/*
		currentFieldNode = mapProperty(recordNode, "datafield", { "tag": marcTag.substring(0,3), "ind1": marcTag.charAt(3), "ind2": marcTag.charAt(4) }, true);
		//run through Map object
		for (let [subID, value] of data) {
			//Check if the key-value pair is of the proper format
			if (!(typeof subID == 'string') && !(typeof value == 'string')) {
				Z.debug(`The subID (${subID}) and value (${value}) are no strings.`);
				return;
			}
			mapProperty(currentFieldNode, "subfield", { "code": subID }, value);
		*/
	} else if (data instanceof Set) { //Case 2/2: data is a Set object
		//run through Set object
		for (let item of data) {
			//Check if the item is in the proper format
			if (item instanceof Map) {
				dataMapToOutput(marcTag, item);
			} else {
				Z.debug(`Type error in ${marcTag}: Map object expected, but ${item} found. Aborted.`);
				continue;
			}
		}
	} else {
		Z.debug(`Type error in ${marcTag}: Map or Set object expected, but ${data} found. Aborted.`);
		return;
	}
	//Z.debug("addDataField out.");
	//Z.debug(debugMarker);
	//return;
}

//Pad a string to two characters
function padToTwo(input) {
    input = "" + input; //make sure input is a string
    if (input.length == 1) { input = "0" + input; }
    return input;
}

//Format the publication date
function dateString(dateIn) {
    var dateOut = "";
    var parsedDate = ZU.strToDate(dateIn);
    if (parsedDate.year) {
        dateOut += Number(parsedDate.year);
        if (parsedDate.month) {
            //There is a very weird error, the value of the field "month" is reduced by one for some reason.
            dateOut += "-" + padToTwo(Number(parsedDate.month) + 1);
            if (parsedDate.day) {
                dateOut += "-" + padToTwo(Number(parsedDate.day));
            }
        }
    }
    return dateOut;
}


/***************************************
 *             Objects
 ***************************************/

//doctypes etc.
//no theses in this translator
//field: Zotero doctype, value: Infoscience field
function ISTypeMap(book, bookSection, conferencePaper, conferencePaperProc, journalArticle, report, presentation, patent) {
    this.book = book;
    this.bookSection = bookSection;
    this.conferencePaper = conferencePaper;
    this.conferencePaperProc = conferencePaperProc; //Currently not used
    this.journalArticle = journalArticle;
	this.report = report;
	this.presentation = presentation;
	this.patent = patent;
}

//constructors for the temp and final versions of the common data
//Units
//PREVIEW: Deactivate this once the other new features are working
function Unit(labAuth, labLDAP, labShort, labManagerEmail, labLiaison, recCreMail) {
    this.labAuth = labAuth; //from serveur: recid
    this.labLDAP = labLDAP; //from serveur: uid
    this.labShort = labShort; //Zotero: item.section
    this.labManagerEmail = labManagerEmail; //from server: manager
	this.labLiaison = labLiaison; //from server: liaison
	this.recCreMail = recCreMail; //zotero: item.rights
}

//Persons (in case there's more than one EPFL author)
//PREVIEW
//STATE: To be completed
//For the moment, restrict to three cases: Full last and first name, full last name & abbrev.
//first name with full stop and full last name and abbreviated first name without full stop
/*
function Person(first, last, auth, sciper) {
    this.firstName = first; //Zotero: item.creators[0]['firstName']
    this.lastName = last; //Zotero: item.creators[0]['lastName']
    this.lhAuth = auth;
    this.nrSciper = sciper;
}
*/

//Replace substring at position given by "index" with the string "character"
String.prototype.replaceAt = function(index, character) {
    return this.substr(0, index) + character + this.substr(index + character.length);
}

//Replace all occurrences of a given substring in a string
String.prototype.replaceAll = function(searchStr, replaceStr) {
    let str = this;
    //check if match exists
    if (str.indexOf(searchStr) === -1) {
        //return str if no match was found
        return str;
    }

    //replace and remove first match and do another recursive search/replace
    return (str.replace(searchStr, replaceStr)).replaceAll(searchStr, replaceStr);
}

/*
001					leader
005					timestamp
020__a				ISBN
022__a				ISSN
0247_a				DOI
0247_2				designation "doi"
02470a				Item reference in other sources (WOS, PubMed, ...)
024702				designation ("isi", "PMID", ...), see object pubSourceMap
037__a	MANDATORY	Publication type ()
245__a	MANDATORY	Title
260__a				Place
260__b				Publisher
260__c	MANDATORY	Date
269__a	MANDATORY	Date; redundant with 260__c
300__a				Number of pages
336__a	MANDATORY	Publication sub-type
340__a				item type OBJECT only, description of the material
4900_a				Series title
4900_v				Series number
500__a				Notes
520__a	MANDATORY	Abstract
700__0				Infoscience authority record
700__a	MANDATORY	Author list
700__g				Affiliation or sciper
7102_a				Corporate author
7112_a	MANDATORY	Conference or meeting name
7112_c				Place
7112_d				Date
773__j	MANDATORY	Volume
773__k	MANDATORY	Issue
773__q	MANDATORY	Pages
773__t	MANDATORY	Title
85641u				Additional URL
909C00				Auth record
909C0m				Lab manager email
909C0p				Acronym
909C0x				LDAP ID (U.....)
909C0z				Bibliothécaire de liaison
960__a				e-mail of the record creator
961__a				e-mail of the record validator
970__a				import batch identifier
973__a				Affiliation [EPFL, _OTHER_]
973__r				Reviewing status [_REVIEWED_, NON-REVIEWED]
973__s				Publication status [SUBMITTED, ACCEPTED, _PUBLISHED_]
980__a	MANDATORY	Infoscience doctype
981__a	MANDATORY	Validation
*/

//MB, 2020-01-08
//ADD: Check if mandatory data are filled in (depending on the publication type) and only continue if all data are fine. Alternative: Let user know which entries are missing.
//Call the main function
function processRecords() {
	Z.setCharacterSet("utf-8");
	var parser = new DOMParser();
	xmlDocument = parser.parseFromString('<collection xmlns="http://www.loc.gov/MARC21/slim" />', 'application/xml');

	//Read global options
	var exportNotes = Z.getOption("exportNotes");
	var includeAbstract = Z.getOption("Include abstract");
	var batchIdentifier = Z.getOption("Batch identifier");
	var validatedRecords = Z.getOption("Validated records");

	Z.debug(`Export notes checkbox: ${exportNotes}`);
	Z.debug(`Include abstract checkbox: ${includeAbstract}`);
	Z.debug(`Batch identifier checkbox: ${batchIdentifier}`);
	Z.debug(`Validated records checkbox: ${validatedRecords}`);

	var validationEntry = "S2";
	if (validatedRecords) {
		validationEntry = "overwrite";
	}

	//allowed values for field 037__a
	//Publication type
	var fieldPubtype = new ISTypeMap("BOOK", "BOOK_CHAP", "CONF", "PROC", "ARTICLE", "REP_WORK", "POST_TALK");

	//allowed values for field 336__a
	//Publication subtype
	var fieldSubtype = new ISTypeMap("Books", "Book Chapters", "Conference Papers", "Conference Proceedings", "Journal Articles", "Reports", "Talks");

	//allowed values for field 980__a
	//Infoscience doctype
	//only almost identical to fieldPubtype
	var fieldDoctype = new ISTypeMap("BOOK", "CHAPTER", "CONF", "PROC", "ARTICLE", "REPORT", "POST_TALK");

	//PREVIEW: Delete this once the new features are working
	var finalUnit = new Unit();//Can we change this into a mere map?
	//var recCreMail = "zotRecCreMail"; //DELETE: redundant

	//Publication status (field 973)
	const STATUS = {
		EPFLOther: "OTHER", // field 973__a
		review: "REVIEWED", // field 973__r
		publication: "PUBLISHED" // field 973__s
	};

	itemCounter = 0;
	//var item, i;
	Z.debug(debugMarker + "Start routine\n" + debugMarker);
	var typeOfPublication = "";
	//var EPFLAuthorFieldNode;

	// First pass: push all Zotero items into an empty array - except the special one where the lab, operator & project are specified
	/*
	ATTENTION: Don't mix up these values
	Data source		MARC	Description
	------------	------	-----------
	item.section	909C0p	lab Acronym (variable: lab_acronym)
	.json			909C00	Infoscience authority record
	.json			909C0m	email of the lab manager
	.json			909C0x	unit shortcode
	item.rights		960__a	email of the record creator
	*/
	var record_array = [];
	//PREVIEW: Activate and test this once the new features are working
	//var commonData = new Map();
	while ((item = Z.nextItem())) {
    	typeOfPublication = item.itemType;
		if (typeOfPublication == "bill" && item.title == "Infoscience") {
			Z.debug("Loading common data...");
			// Create final dataset for the unit
			//PREVIEW: Delete this once the other new features are working
			Z.debug(`The lab acronym of the fake record is ${item.section}.`);
			Object.defineProperty(finalUnit, 'recCreMail', { value: item.rights }); // 960__a or 961__a (record creator's or validator's email)
			Object.defineProperty(finalUnit, 'labAuth', { value: infoscience_labs[item.section]['recid'] }); // 909C00 (Infoscience authority record)
			Object.defineProperty(finalUnit, 'labManagerEmail', { value: infoscience_labs[item.section]['manager'] }); // 909C0m (email lab manager)
			Object.defineProperty(finalUnit, 'labShort', { value: item.section }); // 909C0p (unit acronym)
			Object.defineProperty(finalUnit, 'labLDAP', { value: infoscience_labs[item.section]['uid'] }); // 909C0x (unit shortcode)
			Object.defineProperty(finalUnit, 'labLiaison', { value: infoscience_labs[item.section]['liaison'] }); // 909C0x (unit shortcode)
			/*
			//PREVIEW: Activate this once the other new features are working
			commonData.set(labShort, item.section);
			commonData.set(labAuth, infoscience_labs[item.section]['recid']);
			commonData.set(labManMail, infoscience_labs[item.section]['manager']);
			commonData.set(labLDAP, infoscience_labs[item.section]['uid']);
			commonData.set(labLiaison, infoscience_labs[item.section]['liaison']);
			commonData.set(recCreMail, item.rights);
			*/
			//Object.freeze(FINALUNIT);
    	} else {
			if (EXCLUDED.has(typeOfPublication) === false) { //skip certain document types
				/* * * * * * * * * * * * * * * * * * * *
				*	Idea: Check for mandatory tags and skip if not found.
				* * * * * * * * * * * * * * * * * * * */
				//checkIfMissingMandatoryFields(item) {
				//	
				//	return null
				//}
				Z.debug(`Loading record #${record_array.length + 1}...`);
	        	record_array.push(item);
			} else {
				Z.debug(`Skipping entry of type ${typeOfPublication}.`);
			}
    	}
	}
	Z.debug("All records loaded.");
	Z.debug("");

	var digits = record_array.length.toString().length; // necessary for field 970__a
	//Run through all the items in the list
	record_array.forEach(
		function(item, index) {
			/* * * * * * * * * * * * * * * * * * * *
			 *	PREVIEW
			 *	Idea: Create a data object or Map for every dataset. Keys are MARC tags.
			 *		If no data are added to a particular field: Empty string.
			 *		If data are added: Map or Set containing Map
			 *	Advantage: Allows easy adaptation to different export formats and can be implemented in a more readable manner, since many code
			 *	repetitions of the current version can be avoided.
			 * * * * * * * * * * * * * * * * * * * */
			//var recordItem = new Map();//PREVIEW: Map for current record

			typeOfPublication = item.itemType;
			Z.debug("");
			Z.debug(`Treating entry ${index + 1} / ${record_array.length}: ${typeOfPublication}.`);

			//Differentiate several types of publications. These two variables are important for
			//several places (in the original version of this script)
			//ADD: Write a routine that differentiates the types of record in a finer manner. Motivation: Journal Article and Conference Paper
			//are combined, but need to be distinguished for field 773
			var bibliographicLevel = "m"; //default
			if (typeOfPublication == "bookSection" || typeOfPublication == "conferencePaper" || typeOfPublication == "dictionaryEntry" || typeOfPublication == "encyclopediaArticle" || typeOfPublication == "journalArticle" || typeOfPublication == "magazineArticle" || typeOfPublication == "newspaperArticle") {
				bibliographicLevel = "a";
			}		

			//initial value
			recordLength = 26; // 24 length of the leader + 1 record terminator + 1 field terminator after the leader and directory

			//Create "record"
			recordNode = mapProperty(xmlDocument.documentElement, "record", false, true);
			//Record ID: Automatically created by Infoscience
			
			/* * * * * * * * * * * * * * * * * * * *
			 *	Leave these three variables in unless an appropriate replacement is found!
			 *	currentFieldNode reinitializes a variable used inside the addDataField and addControlField functions
			 *	cleanedDateModified provides the timestamp of the last modification
			 *	firstChild is the first MARCXML child instance (required!) and doesn't do any harm. Will be overwritten by Infoscience
			 * * * * * * * * * * * * * * * * * * * */
			var currentFieldNode; //leader will be added later, but before this node
			var cleanedDateModified = item.dateModified.replace(/\D/g, ''); //format must be YYYYMMDDHHMMSS
			var firstChild = addControlField("005", '' + cleanedDateModified + '.0');
			//var firstChild = mapProperty(recordNode, "controlfield", { "tag": "005" }, cleanedDateModified + '.0');
			
			//020__a: ISBN
			if (item.ISBN) {
				addDataField("020__", cleanISxN(item.ISBN));//cleanISxN returns a Set object
			}

			//022__a: ISSN
			if (item.ISSN) { // && bibliographicLevel == "m") //see also field 773 for e.g. articles
				addDataField("022__", cleanISxN(item.ISSN));//cleanISxN returns a Set object
			}

			//0247_a: DOI
			//0247_2: designation "doi"
			if (item.DOI) {
				let data = new Map();
				data.set('a', item.DOI);
				data.set('2', pubSourceMap['doi']);
				//let entry = new Set([data]);
				addDataField("0247_", data);//PREVIEW: replace this and add data to dataset Map instead
				//recordItem.set("0247_", data);//PREVIEW; parse this Map at the end.
			}

			//02470a: Item reference in other sources (WOS, PubMed, ...)
			//27.10.20 Attention: Identifiers not coming from Web of Knowledge or crossref may add wrong values to the
			// data field 02470a. This should be
			//024702: designation ("isi", "PMID", ...), see object pubSourceMap
			//if (item.extra && bibliographicLevel == "a")//Checking for the item type as well helps to better target the metadata
			if (item.extra) {
				let data = getExtraIdentifiers(item);
				addDataField("02470", data);
			}

			//037__a: Publication type (MANDATORY)
			if (typeOfPublication) {
				//Z.debug(`typeOfPublication: ${typeOfPublication}`);
				//Z.debug(`Subtype: ${fieldPubtype[typeOfPublication]}`);
				let data = new Map();
				data.set('a', fieldPubtype[typeOfPublication]);
				addDataField("037__", data);
			}

			//245__a: Title (MANDATORY)
			if (item.title) {
				Z.debug(`Title: ${item.title}`);
				let data = new Map();
				data.set('a', item.title);
				addDataField("245__", data);
			}

			//Journal information
			//260__a: Place
			//260__b: Publisher
			//260__c: Date (MANDATORY)
			if (item.publisher || item.place || item.date) {
				let data = new Map();
				if (item.place) {
					data.set('a', item.place);
				}
				if (item.publisher) {
					data.set('b', item.publisher);
				}
				if (item.date) {
					data.set('c', dateString(item.date));
				}
				addDataField("260__", data);
			}

			//269__a: Date (MANDATORY); redundant with 260__c
			if (item.date) {
				let data = new Map();
				data.set('a', dateString(item.date));
				addDataField("269__", data);
			}

			//300__a: Number of pages
			if (item.numPages) {
				let data = new Map();
				data.set('a', item.numpages);
				addDataField("300__", data);
			}

			//336__a: Publication sub-type (MANDATORY)
			if (typeOfPublication) {
				//Z.debug(`Subtype: ${fieldSubtype[typeOfPublication]}`);
				let data = new Map();
				data.set('a', fieldSubtype[typeOfPublication]);
				addDataField("336__", data);
			}

			//340__a: item type OBJECT only, description of the material
			if (item.medium) {
				let data = new Map();
				data.set('a', item.medium);
				addDataField("340__", data);
			}

			//4900_a: Series title
			//4900_v: Series number
			if (item.seriesTitle || item.seriesNumber) {
				let data = new Map();
				data.set('a', item.seriesTitle);
				data.set('v', item.seriesNumber);
				addDataField("4900_", data);
			}

			//500__a: Notes
			//Don't export notes at the moment but keep option for future expansion

			//520__a: Abstract (MANDATORY)
			if (item.abstractNote && includeAbstract) {
				let data = new Map();
				data.set('a', item.abstractNote);
				addDataField("520__", data);
			}

			//REVIEW: The keywords are not in Zotero but are given upon input into the platform or by the laboratory
			//700__0: Infoscience authority record
			//700__a: Author list (MANDATORY)
			//700__g: Affiliation or sciper
			//7102_a: Corporate author
			if (item.creators.length > 0) {
				let set_data = new Set();
				for (let i = 0; i < item.creators.length; i++) {
					let entry = new Map();
					let creator = item.creators[i];
					//I couldn't find out what fieldMode (zotero object: creator) meant in the shortness of time. This should be clarified.
					if (!creator.fieldMode && creator.creatorType == "author") {
						var fullname = creator.lastName + ", " + creator.firstName;
						entry.set('a', fullname);
						if (fullname in infoscience_authors) {
							infoscience_authors[fullname].forEach(
								function(author_item, index) {
									if (author_item[2].includes(finalUnit.labShort)) {
										entry.set('0', author_item[0]);
										entry.set('g', author_item[1]);
									}
								}
							);
						}
						set_data.add(entry);
					} else if (creator.creatorType != "editor") {
						//This condition is a bit simplified and potentially misleading. This case should be better defined!
						//Corporate author: CERN (ou ENAC ?) publications
						let data = new Map();
						data.set('a', creator.lastName);
						addDataField("7102_", data);
					}
				}
				addDataField("700__", set_data);
			}

			//Information about conferences
			//7112_a: Conference or meeting name (MANDATORY)
			//7112_c: Place
			//7112_d: Date
			if (typeOfPublication == "conferencePaper") {
				let data = new Map();
				if (item.conferenceName) {
					Z.debug(`Subfield a: ${item.conferenceName}`);
					data.set('a', item.conferenceName);
				}
				if (item.meetingName) {
					Z.debug(`Subfield a: ${item.meetingName}`);
					data.set('a', item.meetingName);
				}
				if (item.place) {
					data.set('c', item.place);
				}
				if (item.date) {
					data.set('d', dateString(item.date));
				}
				addDataField("7112_", data);
			}

			//Journal data
			//ADD: Better verification of mandatory fields
			//773__j: Volume (MANDATORY)
			//773__k: Issue (MANDATORY)
			//773__q: Pages (MANDATORY)
			//773__t: Title (MANDATORY)
			if (bibliographicLevel == "a") {
				let data = new Map();
				if (item.volume) {
					data.set('j', item.volume);
				}
				if (item.issue) {
					data.set('k', item.issue);
				}
				if (item.pages) {
					data.set('q', item.pages);
				}
				if (item.publicationTitle) {
					data.set('t', item.publicationTitle);
				}
				addDataField("773__", data);
			}

			//85641u: Additional URL
			if (!item.DOI && item.url) { //only add the URL if there's no DOI associated with this record
				let data = new Map();
				data.set('u', item.url);
				addDataField("85641", data);
			}

			//Laboratory
			//909C00: Auth record
			//909C0m: Lab manager email
			//909C0p: Acronym
			//909C0x: LDAP ID (U.....)
			//909C0z: Bibliothécaire de liaison
			if (typeOfPublication) {
				//Z.debug(`LabShort: ${finalUnit['labShort']}`);
				let data = new Map();
				data.set('0', finalUnit.labAuth);
				data.set('m', finalUnit.labManagerEmail);
				data.set('p', finalUnit.labShort);
				data.set('x', finalUnit.labLDAP);
				data.set('z', finalUnit.labLiaison);
				addDataField("909C0", data);
			}

			//960__a: e-mail of the record creator
			if (finalUnit.recCreMail) {
				let data = new Map();
				data.set('a', finalUnit.recCreMail);
				addDataField("960__", data);
			}

			//961__a: e-mail of the record validator
			if (validatedRecords) {
				let data = new Map();
				data.set('a', finalUnit.recCreMail);
				addDataField("961__", data);
			}

			//970__a: import batch identifier
			if (batchIdentifier) {//batch identifier is optional
				let data = new Map();
				data.set('a', ("" + (index+1)).padStart(digits, '0') + "/" + finalUnit.labShort);
				addDataField("970__", data);
			}

			//973__a: Affiliation [EPFL, _OTHER_]
			//973__r: Reviewing status [_REVIEWED_, NON-REVIEWED]
			//973__s: Publication status [SUBMITTED, ACCEPTED, _PUBLISHED_]
			if (STATUS) {
				let data = new Map();
				var pubStatus = STATUS.review;
				if (typeOfPublication == "report") {
					pubStatus = "NON-" + pubStatus;
				}
				data.set('a', STATUS.EPFLOther);
				data.set('r', pubStatus);
				data.set('s', STATUS.publication);
				addDataField("973__", data);
			}
			
			//980__a: Infoscience doctype (MANDATORY)
			if (typeOfPublication) {
				//Z.debug(`Doctype: ${fieldDoctype[typeOfPublication]}`);
				let data = new Map();
				data.set('a', fieldDoctype[typeOfPublication]);
				addDataField("980__", data);
			}

			//981__a: Validation (MANDATORY)
			if (typeOfPublication) {
				let data = new Map();
				data.set('a', validationEntry);
				addDataField("981__", data);
			}

			//finally, we will calculate the leader and add it as first child
			recordLength += countFields.controlfield * 13 + countFields.datafield * 15 + countFields.subfield * 2;
			//controlfields: 12 characters in the directory + 1 field terminator
			//datafields: 12 characters in the directory + 2 indicators + 1 field terminator
			//subfields: 1 subfield code + 1 subfield terminator
			//base address of data starts after the leader and the directory
			var typeOfRecord = "a";
			if (typeMap[typeOfPublication]) {
				typeOfRecord = typeMap[typeOfPublication];
			}
			var baseAdressData = 24 + (countFields.controlfield + countFields.datafield) * 12 + 1;
			var leaderContent = fillZerosLeft(recordLength, 5) + "n" + typeOfRecord + bibliographicLevel + " a22" + fillZerosLeft(baseAdressData, 5) + "zu 4500";
			var newElement = xmlDocument.createElementNS(ns, "leader");
			newElement.appendChild(xmlDocument.createTextNode(leaderContent));
			recordNode.insertBefore(newElement, firstChild);
		}
	);

	Zotero.write('<?xml version="1.0"?>' + "\n");
	var serializer = new XMLSerializer();
	var xmlDoc = serializer.serializeToString(xmlDocument);

	//Use the data map to replace all the temporary values.
	// var re = new RegExp(Object.keys(dataMap).join("|"), "g");
	// var xmlDoc = xmlDoc.replace(re, function(matched) {
	//    return dataMap[matched];
	// });

	//Once the "hard data" are replaced, create a nice-looking xml file.
	var pretty = xmlDoc.replace(/<record/g, "\n<record")
		.replace(/<leader/g, "\n\t<leader")
		.replace(/<controlfield/g, "\n\t<controlfield")
		.replace(/<datafield/g, "\n\t<datafield")
		.replace(/<\/datafield/g, "\n\t</datafield")
		.replace(/<subfield/g, "\n\t\t<subfield")
		.replace(/<\/record/g, "\n</record")
		.replace("</collection", "\n</collection"); //only appears once, hence no /.../g
		//Z.debug(pretty);

		//Generate the MARCXML file: Append to already-written xml version statement
		Zotero.write(pretty);
}

//https://github.com/zotero/zotero/commit/f0bd1e77ffab6dbc7fbd600dc1acc11844aa2e02
//https://www.zotero.org/support/dev/client_coding/javascript_api
//https://groups.google.com/forum/m/#!forum/zotero-dev
//https://niche-canada.org/member-projects/zotero-guide/chapter1.html

// Retrieve authority data extracted from Infoscience and converted to JSON before anything happens
// Thus we will be ready to enrich the records with SCIPERs and such when we process them
// Written as a sequence of functions that call each other because HTTP requests are run asynchronously. Sigh.
// (1) download_infoscience_labs() calls extract_lab_data() when the response is complete
// (2) extract_lab_data() calls download_infoscience_authors()
// (3) download_infoscience_authors() calls extract_author_data() after it gets its response
// (4) extract_author_data() eventually calls processRecords() where the actual magic happens.

var infoscience_authors = {};
var infoscience_labs = {};

function extract_author_data(text) {
    Z.debug("Loading Infoscience author records...");
    infoscience_authors = JSON.parse(text);
    //Z.debug(infoscience_authors["Borel, Alain"]);
    // Finally we are ready to process the bibliographic records!
    processRecords();
}

function download_infoscience_authors() {
    Z.debug("Fetching Infoscience author records...");
    var url = 'http://sisbsrv9.epfl.ch/marcxml-infoscience/infoscience_authors.json';
    var headers = {
        'User-Agent': "MARC21XML-Infoscience"
    };
    Z.Utilities.HTTP.doGet(url, extract_author_data, null, null, headers);
}

function extract_lab_data(text) {
    Z.debug("Loading Infoscience lab records...");
    infoscience_labs = JSON.parse(text);
	//Z.debug(infoscience_labs['SISB']);
    // Then we proceed with retrieving the author records as JSON
    download_infoscience_authors();
}

function download_infoscience_labs() {
    Z.debug("Fetching Infoscience author records...");
    var url = 'http://sisbsrv9.epfl.ch/marcxml-infoscience/infoscience_labs.json';
    var headers = {
        'User-Agent': "MARC21XML-Infoscience"
    };
    Z.Utilities.HTTP.doGet(url, extract_lab_data, null, null, headers);
}

function doExport() {
    download_infoscience_labs();
}

