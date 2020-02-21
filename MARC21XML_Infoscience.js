{
    "translatorID": "7670d7e6-5a2c-4f19-9d9a-4cc81e24eb1e",
    "label": "MARC21XML-Infoscience v1.3-pre",
    "creator": "Philipp Zumstein (original version: 'zotkat'), Matthias Bräuninger (tailoring to EPFL), Alain Borel (Infoscience-based improvements)",
    "target": "xml",
    "minVersion": "3.0",
    "maxVersion": "",
    "priority": 100,
    "displayOptions": {
        "exportNotes": true,
        "Include abstract": true
    },
    "inRepository": true,
    "translatorType": 2,
    "browserSupport": "g",
    "lastUpdated": "2020-02-12 10:49:00"
}

// DISCLAIMER:
// There are different cataloguing rules, specification of MARC dialects,
// various usage over time and places. This export translator will follow
// the current MARC21 bibliographic format which is described online:
// http://www.loc.gov/marc/bibliographic/


// MODS to MARC21 mapping:
// http://www.loc.gov/standards/mods/v3/mods2marc-mapping.html

// source for MARC21 XML examples (replace idn number):
// https://portal.dnb.de/opac.htm?method=requestMarcXml&idn=999678876

// Some more useful links:
// https://github.com/zotero/translators/blob/master/MARC.js
// https://github.com/zotero/translators/issues/762
// https://forums.zotero.org/discussion/38956/export-of-zotero-citation-to-marc-format-for-import-into-koha-lms

/*
 * Define common variable for temporary and final values to be inserted into every publication.
 * 
 * SITUATION:
 * (I) A new laboratory is created at EPFL
 * (II) The new head of the new lab wishes to import all her/his pre-EPFL publications to Infoscience
 * (III) A list of publications (DOIs, publication titles or a bibtex file) is given to a librarian
 * 
 * 
 * SOLUTIONS SOUGHT:
 * (A) Create a harmonized publication list with entries that are as complete as possible
 * (B) Translate this list into an Infoscience-compatible format
 * (C) Provide metadata common to all entries and include them into the output file
 * (D) Avoid synchronising sensitive data with the Zotero servers
 * 
 * 
 * SOLUTION:
 * (1)	Zotero can import literature from several sources
 * 	(1a)	If a list of DOIs is available, import directly into Zotero
 * 	(1b)	If a list of titles and authors is available, use the crossref text query to obtain a list of DOIs
 * 	(1c) If a bibtex file is available, import the bibtex file into Zotero
 * (2)	OPTIONAL: Acquire more information about the bibliography from other sources, e. g. scopus or WoS
 * (3)	Define a bibliographic element that holds the common metadata
 * (4)	Export the bibliography as MARCXML and import it into Infoscience
 * 
 * 
 * Steps (1) through (3) are taken care of by Zotero with possible utilization of crossref and WoS. Step (3) is required, since  This script
 * deals with step (4) by exporting the received and treated list into a MARCXML file, which is privileged over
 * a CSV file. The reason for this is a less memory-intensive treatment:
 * The export translators in Zotero read the bibliography line by line and stop when no new element is
 * read. The size of the bibliography is thus unknown and certain data, such as the maximum number of
 * authors for a single publication on the list, cannot be determined beforehand. This creates a situation
 * in which a MARCXML file is easier to handle than a CSV file:
 * - MARCXML: A line or block of lines is appended to the output file (more precisely, the string making up
 * 		the output file) for every new author. The maximum number of authors of all imported publications
 * 		is thus irrelevant. During operation, the memory holds one one-dimensional array (the current entry)
 * 		and one string (the file to be exported)
 * - authors in CSV: Data are stored in fields in an array. Every author requires three fields (full name,
 * 		authority record and SCIPER number). The maximum number of authors defines the necessary number of
 * 		fields and thus needs to be known before defining the array. As a consequence, the full list of
 * 		publications needs to be read before any operation on the output file can begin. During operation,
 * 		the memory holds one two-dimensional array (the full publication list) and one string (the file
 * 		to be exported). Existing keywords for publications pose an analogous challenge
 * 
 * 
 * The list of publications the script receives from Zotero is assumed to be ordered in a random manner.
 * Among these publications, an element holding data common to the whole list will appear eventually. Since
 * it has not been possible to 
 * 
 * The idea is to retrieve the lab head's name and data from an entry of the bibliography which
 * is not common. The item "bill" is such an object and also offers the possibility to define three arrays:
 * "Sponsors", "Abstract" and "Extra". These can be used to define a list of authors, authority records and 
 * sciper numbers. The item "bill" also offers fields that are suitable to hold information for the new unit
 * 
 * 
 * - authors (stored in "sponsors")
 * - authority recors (stored in "abstract")
 * - sciper numbers (stored in "extras")
 * Additional data are necessary for a new unit, such as
 * - lab authority record (stored in "code")
 * - laboratory group ID (stored in "section")
 * - lab short name (stored in "legislative body")
 * The e-mail of the record creator is stored in "rights".
 * 
 * In possible future extensions, several authors and labs could be combined. Since it is possible to add an (almost)
 * arbitrary number of notes which can hold any amount of text, this could become quite flexible.
 * 
 * The next version could feature the use of objects to define datafields and their subfields to clean up the code
 */

//Functions

//Replace substring at position given by "index" with the string "character"
String.prototype.replaceAt = function(index, character) {
    return this.substr(0, index) + character + this.substr(index + character.length);
};

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

function fillZerosLeft(text, size) {
    if (!text) text = '';
    if (typeof text == 'number') text = text.toString();
    missingCharacters = size - text.length;
    if (missingCharacters > 0) {
        text = Array(missingCharacters + 1).join('0') + text;
    }
    return text;
}

/*
//Combined ISBN and ISSN cleaning function
function cleanisxn(rawData, marcTag) {
	marcTag = marcTag.replace(/_/g, " ");
	let fullArray = [];
	let cleanData = rawData.trim(); //remove leading and trailig whitespaces first, just to be on the safe side
	//ISSNs in Zotero are separated by a whitespace + comma, ISBNs by a whitespace.
	if (cleanData.indexOf(" ") !== -1) { //Still some whitespaces found?
		fullArray = cleanData.split(" "); //In this case, we assume that it's a list and extract all entries
	}
	else
		fullArray.push(cleanData);//No list: We just add the value to the array
	}
	for (let i = 0; i < fullArray.length; i++) {
		currentFieldNode = mapProperty(recordNode, "datafield", { "tag": marcTag.substring(0,3), "ind1": marcTag.charAt(3), "ind2": marcTag.charAt(4) }, true);
		mapProperty(currentFieldNode, "subfield", { "code": marcTag.charAt(marcTag.length-1) }, fullArray[i].replace(/[a-zA-Z,\.;:_]/g, '')); //Delete what's left of the special characters and add to subfield
	}
}
*/

// @property can either a string which will be attachad as a textNode
// or just the Boolean "true" which will then just create the nodes
// without any content

function mapProperty(parentElement, elementName, attributes, property) {
    if (!property) return null;
    //var xmlDocument = parentElement.ownerDocument,
    newElement = xmlDocument.createElementNS(ns, elementName);
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

//Basis for replacing the unwieldy node functions with inputs coming from the MARCfield objects
function subfield(index, content) {
    return '<subfield code="' + index + '">' + content + '</subfield>'; //captures the whole line, but without the linefeed
}

function nameVariants(first, last) {
    let prefix = last + ', ';
    let short = prefix + first.charAt(0)
    //return an object. Can be run through with a loop (for(let key in obj) { //do stuff }.
    return {
        "full": prefix + first,
        "shortStop": short + '.',
        "short": short
    };
}

function padToTwo(input) {
    //make sure input is a string
    input = "" + input;
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

/*
//REVIEW: The author data obtained from the server aren't necessarily uniform. Use this function to check for variants of the name and to unify the spelling.
//This function should return the replacement string for the data map.

function replaceAuthorSubfield(inputString, person)
{
	//inputString: The string that is to be changed
	//person: The object holding the credentials of the lab head to be added
	
	//Find all names
	//Search for the longest name first to avoid false positives: "Inventé, Jean-Michel" correspondrait aussi à "Inventé, J".
	var possibleNames = new Array();
	possibleNames[0] = nameVariants(person.firstName, person.lastName).full;
	//Z.debug(nameVariants(person.firstName, person.lastName).full);
	possibleNames[1] = nameVariants(person.firstName, person.lastName).shortStop;
	//Z.debug(nameVariants(person.firstName, person.lastName).shortStop);
	possibleNames[2] = nameVariants(person.firstName, person.lastName).short;
	//Z.debug(nameVariants(person.firstName, person.lastName).short);
	
	//Use the person's unabbreviated name in the record
	var newString = subfield('a', possibleNames[0]) + subfield('0', person.lhAuth) + subfield('g', person.nrSciper);
	Z.debug(newString);
	
	var searchString = '';
	let checkString = '</s';
	
	var errorCount = 0;
	let skipCount = 0;
	//let output = "-1";
	
	var outputString = "ERROR";
	
	for ( let i = 0; i < possibleNames.length; i++ )
	{
		searchString = subfield('a', possibleNames[i]);
		
		//Z.debug(debugMarker);
		Z.debug("Checking for " + searchString + ":");
		//Z.debug(debugMarker);
		
		if (inputString.indexOf(searchString) !== -1)
		{
			//Check if checkString follows after the name. If not, add letters from the existing string until it matches.
			//Then delete checkString from this string.
			//let lowLim = indexOf(SearchString) + searchString.length + 1;
			//let upLim = lowLim + checkString.length + 1;
			//
			//if (inputString.splice(lowLim, upLim) === checkString) { //we found the full author's name }
			/*
			Z.debug("Yep, found it!");
			outputString = searchString;
			break;
		}
		else
		{
			skipCount++;
		}
	}
	
	if(skipCount === possibleNames.length)
	{
		Z.debug("No name variant has been found");
	}
	return return outputString;
}
*/

//Objects
/*
//MARC fields
//Keep this for a future extension
function MarcField(type, tag, idOne, idTwo)
{
	this.fieldType = type; //e. g. "datafield" (^[a-z]$)
	this.fieldTag = tag; //e. g. "700" (^[0-9]{3}$)
	this.fieldIDOne = idOne; //often " " (^[0-9 ]{1}$)
	this.fieldIDTwo = idTwo; //often " " (^[0-9 ]{1}$)
	this.name = this.fieldTag + this.fieldIDOne.replace(" ", "_") + this.fieldIDTwo.replace(" ", "_");
	this.subfield = {}; //subfields can be given as { "a": "<someStuff>", "b": "<someOtherStuff>", ...}
}

//MARC subfields
//Keep this for a possible future extension
functionMarcSubfield(sfid, text, parent)
{
	this.subfieldID = sfid; (^[a-z0-9 ]{1}$)
	this.subfieldText = text;
	this.name = parent.name + "_" + this.subfieldID;
}
*/

//doctypes etc.
//no theses in this translator
function ISTypeMap(book, bkSectn, cnfPaper, cnfProc, artcl, rprt) {
    this.book = book;
    this.bookSection = bkSectn;
    this.conferencePaper = cnfPaper;
    this.conferencePaperProc = cnfProc; //Currently not used
    this.journalArticle = artcl;
    this.report = rprt;
}

//constructors for the temp and final versions of the common data
//Units
function Unit(auth, ID, short, mail) {
    this.labAuth = auth; //Zotero: item.code
    this.labLDAP = ID; //Zotero: item.section
    this.labShort = short; //Zotero: item.legislativeBody
    this.labManagerEmail = mail; //Zotero: item.session
}

//Persons (in case there's more than one EPFL author)

//For the moment, restrict to three cases: Full last and first name, full last name & abbrev.
//first name with full stop and full last name and abbreviated first name without full stop
function Person(first, last, auth, sciper) {
    this.firstName = first; //Zotero: item.creators[0]['firstName']
    this.lastName = last; //Zotero: item.creators[0]['lastName']
    this.lhAuth = auth;
    this.nrSciper = sciper;
}

//Variables
var typeMap = {
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

//MB, 16.01.2020
//No theses
var secondTypeMap = { //based on 008/24-27
    "patent": "j",
    "statute": "l",
    "case": "v"
};

var pubSourceMap = { // key: Zotero entry in "extra" ; value: Infoscience entry in 024702
    "DOI": "DOI",
    "WOS": "ISI",
    //"Scopus" : "ScopusID", // Ignore for the moment: ScopusID doesn't show in Zotero
    "PMID": "PMID",
    "arXiv": "arXiv"
}

var debugMarker = "----------------------------\n";

// Add to this to account for additional cases such as transcriptions of special characters
//var authorSubfieldContents = new Array(3,2);

/*
 * Name variants: Since an author's name can be composed of special characters, a large range of possibilities have to be accounted for.
 * Idea: Create an array with the most common replacements (e. g., ö -> oe, ä -> ae etc.) and one with the author's name. When the metadata item is
 * 	found, run through the replacement array to find several variants. When a special character is found, add the replacement to the array holding
 * 	the authors' name.
 */
//var transcriptionArray = new Array();

var recordNode;
var itemCounter = 0;

var recordLength;
var countFields = { "controlfield": 0, "datafield": 0, "subfield": 0 };
var ns = "http://www.loc.gov/MARC21/slim";
var xmlDocument;

//MB, 2020-01-08
//ADD: Check if mandatory data are filled in (depending on the publication type) and only continue if all data are fine. Alternative: Let user know which entries are missing.
//ADD: Clean up code (lots of redundancies, create reasonable functions!) and try and use dictionaries/hashtables (too complicated?)




//Call the main function
function doWhatWeWant() {
    Z.setCharacterSet("utf-8");
    var parser = new DOMParser();
    xmlDocument = parser.parseFromString('<collection xmlns="http://www.loc.gov/MARC21/slim" />', 'application/xml');


    // Z.debug(infoscience_authors["Helm, Lothar"]);
    Z.debug(infoscience_labs["LPI"]);

    //Read global options
    var exportNotes = Z.getOption("exportNotes");
    var includeAbstract = Zotero.getOption("Include abstract");

    //MB, 14.01.2020
    //Infoscience-specific key-value pairs
    /*
    The lists "fieldPubtype", "fieldSubtype" and "fieldDoctype" specify the possible
    contents of the fields 037__a, 336__a and 980__a in Infoscience, linked to the type of the item read from Zotero.
	
    The object ISTypeMap provides the translation between the publication types from Zotero and the three classes of publications (publication type,
    publication subtype and doctype) used in Infoscience. ISTypeMap serves as blueprint for the three corresponding translators fieldPubtye,
    fieldSubtype and fieldDoctype defined below.
	
    Since "conference proceedings" is not among Zotero's publication types, "Book" should be preferred to classify it in Zotero. In the case that a future
    update of Zotero introduces conference proceedings, the type maps currently contain a corresponding entry.
    */

    //possible values for field 037__a
    //Publication type
    var fieldPubtype = new ISTypeMap("BOOK", "BOOK_CHAP", "CONF", "PROC", "ARTICLE", "REP_WORK");

    //possible values for field 336__a
    //Publication subtype
    var fieldSubtype = new ISTypeMap("Books", "Book Chapters", "Conference Papers", "Conference Proceedings", "Journal Articles", "Reports");

    //possible values for field 980__a
    //Infoscience doctype
    //only almost identical to fieldPubtype
    
    var fieldDoctype = new ISTypeMap("BOOK", "CHAPTER", "CONF", "PROC", "ARTICLE", "REPORT");
    //Can't do this: Changing fieldDoctype affects fieldPubtype
    //var fieldDoctype = fieldPubtype;
    //fieldDoctype.bookSection = "CHAPTER";
    //fieldDoctype.report = "REPORT";

    Z.debug(debugMarker + JSON.stringify(fieldPubtype, null, 4) + debugMarker);
	Z.debug(debugMarker + JSON.stringify(fieldSubtype, null, 4) + debugMarker);
	Z.debug(debugMarker + JSON.stringify(fieldDoctype, null, 4) + debugMarker);

    var finalUnit = new Unit();

    var recCreMail = "zotRecCreMail";

    //Z.debug(debugMarker + JSON.stringify(dataMap, null, 4) + debugMarker);

    //Publication status
    var status = {
        EPFLOther: "OTHER", // field 973__a
        review: "REVIEWED", // field 973__r
        publication: "PUBLISHED" // field 973__s
    };

    itemCounter = 0;

    var item, i;

    Z.debug(debugMarker + "Start routine\n" + debugMarker);

    var typeOfPublication = "";
    var EPFLAuthorFieldNode;

    // First pass: push all Zotero items into an empty array - except the special one where the lab, operator & project are specified
    var record_array = [];
    while ((item = Z.nextItem())) {
    	typeOfPublication = item.itemType;

        if (typeOfPublication == "bill" && item.title == "Infoscience") {
        	// Z.debug("found the fake record");
            recCreMail = item.rights; // 960__a

            // Create final dataset for the unit
            var lab_code = item.legislativeBody;
            Object.defineProperty(finalUnit, "labLDAP", { value: lab_code }); // 909C0p
            Object.defineProperty(finalUnit, "labAuth", { value: infoscience_labs[lab_code]["recid"] }); // 909C00 (Infoscience)
            Object.defineProperty(finalUnit, "labManagerEmail", { value: infoscience_labs[lab_code]["manager"] }); // 909C0m
            Object.defineProperty(finalUnit, "labShort", { value: infoscience_labs[lab_code]["uid"] }); // 909C0x

            // Create final dataset for the lab head
            // We will no longer need this when I'm done. AB 2020-02-14
            // Object.defineProperty(labHead, "firstName", { value: item.creators[0]['firstName'] }); //for 700__a
            // Object.defineProperty(labHead, "lastName", { value: item.creators[0]['lastName'] }); //for 700__a
            // Object.defineProperty(labHead, "lhAuth", { value: item.abstractNote }); //field 700_0
            // Object.defineProperty(labHead, "nrSciper", { value: item.extra }); //field 700_g

            //Z.debug(debugMarker + labHead + debugMarker);
            //Z.debug(debugMarker + finalUnit + debugMarker);

            //Z.debug(debugMarker + JSON.stringify(labHead, null, 4) + debugMarker);
            //Z.debug(debugMarker + JSON.stringify(finalUnit, null, 4) + debugMarker);

            //Add last element: Replacement of the author field
            // var tempAuthorSubfield = subfield("a", finalUnit.unitHead.lastName + ", " + finalUnit.unitHead.firstName);
            // var newAuthorSubfield = tempAuthorSubfield + subfield("0", finalUnit.unitHead.lhAuth) + subfield("g", finalUnit.unitHead.nrSciper);
            //Z.debug("tempAuthorSubfield: " + tempAuthorSubfield);
            //Z.debug("newAuthorSubfield: " + newAuthorSubfield);

        } else {
        	// Z.debug("this record looks legit, saving it");
            record_array.push(item);
        }

    }




    /*
    //Z.debug(debugMarker + 
    //	"Today, we're treating publications of\n" +
    //	labHeadFirstName + " " + labHeadLastName + ", " + unitShort + "\n" +
    //	debugMarker);
    */

    var digits = record_array.length.toString().length;
    //Run through all the items in the list
    record_array.forEach(function(item, index) {
    	typeOfPublication = item.itemType;

        Z.debug(debugMarker +
            "Entry " + ++itemCounter + ": " + typeOfPublication + "\n" + debugMarker);

        //This is to demonstrate that the month in Zotero starts with 0
        //Z.debug(debugMarker + JSON.stringify(ZU.strToDate("31/1/2019"), null, 4) + debugMarker);

        // limit analysis to non-thesis entries
        if (typeOfPublication != "thesis") {
            //Z.debug(item);

            //Differentiate several types of publications. These two variables are important for
            //several places (in the original version of this script)
            var typeOfRecord = "a";
            if (typeMap[typeOfPublication]) { typeOfRecord = typeMap[typeOfPublication]; }

            var bibliographicLevel = "m"; //default
            if (typeOfPublication == "bookSection" || typeOfPublication == "conferencePaper" || typeOfPublication == "dictionaryEntry" || typeOfPublication == "encyclopediaArticle" || typeOfPublication == "journalArticle" || typeOfPublication == "magazineArticle" || typeOfPublication == "newspaperArticle") {
                bibliographicLevel = "a";
            }

            //ADD: Write a routine that differentiates the types of record in a finer manner. Motivation: Journal Article and Conference Paper
            //are combined, but need to be distinguished for field 773	

            //initial value
            recordLength = 26; // 24 length of the leader + 1 record terminator + 1 field terminator after the leader and directory

            //Create "record"
            recordNode = mapProperty(xmlDocument.documentElement, "record", false, true);

            var currentFieldNode;

            //leader will be added later, but before this node

            //Record ID: Automatically created by Infoscience

            //Timestamp of last modification
            //Leave this in: It's the first child instance and doesn't do any harm. WIll be overwritten by Infoscience
            var cleanedDateModified = item.dateModified.replace(/\D/g, ''); //format must be YYYYMMDDHHMMSS
            var firstChild = mapProperty(recordNode, "controlfield", { "tag": "005" }, cleanedDateModified + '.0');

            //TO DO:
            //Combine the ISBN and ISSN function using a MARC field object. Make sure the hyphens in the ISSN stay in place.

            //020__a: ISBN			
            if (item.ISBN) {
                //cleanisxn(item.ISBN, "020__a");
                let rawISBN = item.ISBN.trim(); //remove leading and trailig whitespaces first, just to be on the safe side
                if (rawISBN.indexOf(" ") !== -1) //Still some whitespaces found?
                {
                    let allISBNArray = rawISBN.split(" ");
                    for (let i = 0; i < allISBNArray.length; i++) //Create a field for every ISBN number found in the record
                    {
                        currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "020", "ind1": " ", "ind2": " " }, true);
                        mapProperty(currentFieldNode, "subfield", { "code": "a" }, allISBNArray[i].replace(/[a-zA-Z,\.;:_]/g, '')); //not replacing the hyphens. Original: .replace(/[a-zA-Z,\.;:\-_]/g, '')
                    }
                    /*
                    let cleanedISBN = item.ISBN.replace(/[a-zA-Z,\.;:\-_]/g, '');//can there be more than one isbn in the item.ISBN field? 
                    currentFieldNode = mapProperty(recordNode, "datafield", {"tag" : "020", "ind1" : " ", "ind2" : " " }, true );
                    mapProperty(currentFieldNode, "subfield", {"code" : "a"}, cleanedISBN );
                    */
                }
            }

            //022__a: ISSN
            if (item.ISSN) // && bibliographicLevel == "m") //see also field 773 for e.g. articles
            {
                //cleanisxn(item.ISSN, "022__a");
                let rawISSN = item.ISSN.trim();
                let allISSNArray = rawISSN.split(", ");
                for (let i = 0; i < allISSNArray.length; i++) {
                    currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "022", "ind1": " ", "ind2": " " }, true);
                    mapProperty(currentFieldNode, "subfield", { "code": "a" }, allISSNArray[i]);
                }
                /*
                currentFieldNode = mapProperty(recordNode, "datafield", {"tag" : "022", "ind1" : " ", "ind2" : " " }, true );
                mapProperty(currentFieldNode, "subfield", {"code" : "a"}, item.ISSN );
                */
            }

            //0247_a: DOI
            //0247_2: designation "doi"
            //if (item.DOI && bibliographicLevel == "a")
            if (item.DOI) {
                //Z.debug("DOI found: " + item.DOI);
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "024", "ind1": "7", "ind2": " " }, true);
                mapProperty(currentFieldNode, "subfield", { "code": "a" }, item.DOI);
                mapProperty(currentFieldNode, "subfield", { "code": "2" }, "doi");
            }

            //02470a: Item reference in other sources (WOS, PubMed, ...)
            //024702: designation ("isi", "PUBMED", ...), see object pubSourceMap
            //if (item.extra && bibliographicLevel == "a")//Checking for the item type as well helps to better target the metadata
            if (item.extra) {
                //Z.debug("Checking identifier:");
                let extraIdentifier = "";
                //colon plus optional whitespace
                let patt = /:\s?/;
                if (item.extra.match("\n")) {
                    //Z.debug("newline found");
                    //several lines: Only use first one (can be expanded later)
                    extraIdentifier = item.extra.split("\n")[0].split(patt);
                } else {
                    extraIdentifier = item.extra.split(patt);
                }

                //Z.debug("extraIdentifier: " + extraIdentifier);

                if (item.extra.match(extraIdentifier[1])) //Really more of a security check, can probably be deleted
                {
                    //replace with generalized cleaned identifier
                    //let cleanedID = item.extra.replace(itemExtraPrefix, '');//remove prefix	
                    //Z.debug("ID " + extraIdentifier[1] + " matches!");
                    currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "024", "ind1": "7", "ind2": "0" }, true);
                    mapProperty(currentFieldNode, "subfield", { "code": "a" }, extraIdentifier[1].trim()); //Adds identifier from Zotero
                    mapProperty(currentFieldNode, "subfield", { "code": "2" }, pubSourceMap[extraIdentifier[0]]); // translates Zotero to Infoscience
                    //Z.debug("pubSourceMap: " + pubSourceMap[extraIdentifier[0]]);
                }
            }

            //037__a: Publication type (MANDATORY)
            if (typeOfPublication) {
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "037", "ind1": " ", "ind2": " " }, true);
                mapProperty(currentFieldNode, "subfield", { "code": "a" }, fieldPubtype[typeOfPublication]);
            }

            //245__a: Title (MANDATORY)
            if (item.title) {
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "245", "ind1": " ", "ind2": " " }, true);
                mapProperty(currentFieldNode, "subfield", { "code": "a" }, item.title);
            }

            //Journal information
            //260__a: Place
            //260__b: Publisher
            //260__c: Date (MANDATORY)
            if (item.publisher || item.place || item.date) {
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "260", "ind1": " ", "ind2": " " }, true);
                if (item.place) {
                    mapProperty(currentFieldNode, "subfield", { "code": "a" }, item.place);
                }
                if (item.publisher) {
                    mapProperty(currentFieldNode, "subfield", { "code": "b" }, item.publisher);
                }
                if (item.date) {
                    mapProperty(currentFieldNode, "subfield", { "code": "c" }, dateString(item.date));
                }
            }

            //269__a: Date (MANDATORY); redundant with 260__c
            if (item.date) {
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "269", "ind1": " ", "ind2": " " }, true);
                mapProperty(currentFieldNode, "subfield", { "code": "a" }, dateString(item.date));
            }

            //300__a: Number of pages
            if (item.numPages) {
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "300", "ind1": " ", "ind2": " " }, true);
                mapProperty(currentFieldNode, "subfield", { "code": "a" }, item.numpages);
            }
            /*
					//Original version: Account for volumes and running time as well. Keep for possible extension
					if (item.numPages || item.numberOfVolumes || item.runningTime) {
					currentFieldNode = mapProperty(recordNode, "datafield",  {"tag" : "300", "ind1" : " ", "ind2" : " " } , true );
					var extensionArray = [];
					if (item.numberOfVolumes) {
						if ( item.numPages.match(/[a-zA-Z]/) ) {
								extensionArray.push( item.numberOfVolumes );
						} else {
							extensionArray.push( item.numberOfVolumes + " v." );
						}
					}
					if (item.numPages) {
						if ( item.numPages.match(/[a-zA-Z]/) ) {
							extensionArray.push( item.numPages );
						} else {
							extensionArray.push( item.numPages + " p." );
						}
					}
					if 	(item.runningTime) {
						extensionArray.push( item.runningTime );
					}
					mapProperty(current	FieldNode, "subfield",  {"code" : "a"} , extensionArray.join(" : ") );		
				} */

            //336__a: Publication sub-type (MANDATORY)
            if (typeOfPublication) {
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "336", "ind1": " ", "ind2": " " }, true);
                mapProperty(currentFieldNode, "subfield", { "code": "a" }, fieldSubtype[typeOfPublication]);
            }

            //340__a: item type OBJECT only, description of the material
            if (item.medium) {
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "340", "ind1": " ", "ind2": " " }, true);
                mapProperty(currentFieldNode, "subfield", { "code": "a" }, item.medium);
            }

            //4900_a: Series title
            //4900_v: Series number
            if (item.seriesTitle || item.seriesNumber) {
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "490", "ind1": "0", "ind2": " " }, true);
                mapProperty(currentFieldNode, "subfield", { "code": "a" }, item.seriesTitle);
                mapProperty(currentFieldNode, "subfield", { "code": "v" }, item.seriesNumber);
            }

            //500__a: Notes
            //Don't export notes at the moment but keep option for future expansion
            /*
            if (item.notes.length>0 && exportNotes)
            {
            	currentFieldNode = mapProperty(recordNode, "datafield",  {"tag" : "500", "ind1" : " ", "ind2" : " " } , true );
            	let noteArray = [];
            	for (i=0; i<item.notes.length; i++)
            	{
            		noteArray.push(item.notes[i].note);
            	}
            	mapProperty(currentFieldNode, "subfield",  {"code" : "a"} , noteArray.join("; ") );
            }
            */

            //520__a: Abstract (MANDATORY)
            if (item.abstractNote && includeAbstract) {
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "520", "ind1": " ", "ind2": " " }, true);
                mapProperty(currentFieldNode, "subfield", { "code": "a" }, item.abstractNote);
            }

            //REVIEW: The keywords are not in Zotero but are given upon input into the platform or by the laboratory
            //700__0: Infoscience authority record
            //700__a: Author list (MANDATORY)
            //700__g: Affiliation or sciper

            //7102_a: Corporate author

            for (let i = 0; i < item.creators.length; i++) {
                let creator = item.creators[i];
                if (!creator.fieldMode) {
                    currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "700", "ind1": " ", "ind2": " " }, true);
                    var fullname = creator.lastName + ", " + creator.firstName;
                    mapProperty(currentFieldNode, "subfield", { "code": "a" }, fullname);
                    if (fullname in infoscience_authors) {
                    	// Z.debug(infoscience_authors[fullname]);
                    	infoscience_authors[fullname].forEach(function(author_item, index) {
                    		// Z.debug(author_item);
                    		if (author_item[2].includes(lab_code)) {
                    			mapProperty(currentFieldNode, "subfield", { "code": "g" }, author_item[0]);
                    			mapProperty(currentFieldNode, "subfield", { "code": "0" }, author_item[1]);
                    		}
                    	});
                    }
                } else {
                    //Corporate author: CERN (ou ENAC ?) publications
                    currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "710", "ind1": "2", "ind2": " " }, true);
                    mapProperty(currentFieldNode, "subfield", { "code": "a" }, creator.lastName);
                }
            }

            //Information about conferences
            //7112_a: Conference or meeting name (MANDATORY)
            //7112_c: Place
            //7112_d: Date
            if (typeOfPublication == "conferencePaper") {
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "711", "ind1": "2", "ind2": " " }, true);
                if (item.conferenceName) {
                    mapProperty(currentFieldNode, "subfield", { "code": "a" }, item.conferenceName);
                }
                if (item.meetingName) {
                    mapProperty(currentFieldNode, "subfield", { "code": "a" }, item.meetingName);
                }
                if (item.place) {
                    mapProperty(currentFieldNode, "subfield", { "code": "c" }, item.place);
                }
                if (item.date) {
                    mapProperty(currentFieldNode, "subfield", { "code": "d" }, dateString(item.date));
                }
            }

            //Journal data
            //773__j: Volume (MANDATORY)
            //773__k: Issue (MANDATORY)
            //773__q: Pages (MANDATORY)
            //773__t: Title (MANDATORY)
            if (bibliographicLevel == "a") {
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "773", "ind1": " ", "ind2": " " }, true);
                if (item.volume) {
                    mapProperty(currentFieldNode, "subfield", { "code": "j" }, item.volume);
                }
                if (item.issue) {
                    mapProperty(currentFieldNode, "subfield", { "code": "k" }, item.issue);
                }
                if (item.pages) {
                    mapProperty(currentFieldNode, "subfield", { "code": "q" }, item.pages);
                }
                if (item.publicationTitle) {
                    mapProperty(currentFieldNode, "subfield", { "code": "t" }, item.publicationTitle);
                }
            }

            //85641u: Additional URL
            if (!item.DOI && item.url) {
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "856", "ind1": "4", "ind2": "1" }, true);
                mapProperty(currentFieldNode, "subfield", { "code": "u" }, item.url);
            }

            //Laboratory
            //909C00: Auth record
            //909C0p: Short name
            //909C0x: Group ID (U.....)
            if (typeOfPublication) {
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "909", "ind1": "C", "ind2": "0" }, true);
                mapProperty(currentFieldNode, "subfield", { "code": "0" }, infoscience_labs[lab_code]["recid"]);
                mapProperty(currentFieldNode, "subfield", { "code": "m" }, infoscience_labs[lab_code]["manager"]);
                mapProperty(currentFieldNode, "subfield", { "code": "p" }, lab_code);
                mapProperty(currentFieldNode, "subfield", { "code": "x" }, infoscience_labs[lab_code]["uid"]);
            }

            //960__a: e-mail of the record's creator
            currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "960", "ind1": " ", "ind2": " " }, true);
            mapProperty(currentFieldNode, "subfield", { "code": "a" }, recCreMail);

            //970__a: import batch identifier
            currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "970", "ind1": " ", "ind2": " " }, true);
            mapProperty(currentFieldNode, "subfield", { "code": "a" }, index.padStart(digits, '0') + "/" + lab_code);

            //973__a: Affiliation [EPFL, OTHER]
            //973__r: Reviewing status [REVIEWED, NON-REVIEWED]
            //973__s: Publication status [SUBMITTED, ACCEPTED, PUBLISHED]
            currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "973", "ind1": " ", "ind2": " " }, true);
            mapProperty(currentFieldNode, "subfield", { "code": "a" }, status.EPFLOther);
            mapProperty(currentFieldNode, "subfield", { "code": "r" }, status.review);
            mapProperty(currentFieldNode, "subfield", { "code": "s" }, status.publication);

            //980__a: Infoscience doctype (MANDATORY)
            if (typeOfPublication) {
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "980", "ind1": " ", "ind2": " " }, true);
                mapProperty(currentFieldNode, "subfield", { "code": "a" }, fieldDoctype[typeOfPublication]);
            }

            //981__a: Validation (MANDATORY)
            if (typeOfPublication) {
                currentFieldNode = mapProperty(recordNode, "datafield", { "tag": "981", "ind1": " ", "ind2": " " }, true);
                mapProperty(currentFieldNode, "subfield", { "code": "a" }, "S2");
            }

            //finally, we will calculate the leader and add it as first child

            recordLength += countFields.controlfield * 13 + countFields.datafield * 15 + countFields.subfield * 2;
            //controlfields: 12 characters in the directory + 1 field terminator
            //datafields: 12 characters in the directory + 2 indicators + 1 field terminator
            //subfields: 1 subfield code + 1 subfield terminator
            //base address of data starts after the leader and the directory
            //var baseAdressData = 24 + countFields.controlfield * 12 + countFields.datafield * 12 + 1;
            var baseAdressData = 24 + (countFields.controlfield + countFields.datafield) * 12 + 1;

            var leaderContent = fillZerosLeft(recordLength, 5) + "n" + typeOfRecord + bibliographicLevel + " a22" + fillZerosLeft(baseAdressData, 5) + "zu 4500";
            var newElement = xmlDocument.createElementNS(ns, "leader");
            newElement.appendChild(xmlDocument.createTextNode(leaderContent));
            recordNode.insertBefore(newElement, firstChild);

        }
    });

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
        .replace("</collection", "\n</collection");
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
// (4) extract_author_data() eventually calls doWhatWeWant() where the actual magic happens.

var infoscience_authors = {};
var infoscience_labs = {};

function extract_author_data(text) {
    Z.debug("About to load Infoscience author records.");
    infoscience_authors = JSON.parse(text);
    Z.debug(infoscience_authors["Borel, Alain"]);
    // Finally we are ready to process the bibliographic records!
    doWhatWeWant();
}

function download_infoscience_authors() {
    Z.debug("About to fetch Infoscience author records.");
    var url = 'https://sisbsrv2.epfl.ch/static/infoscience_authors.json';
    var headers = {
        'User-Agent': "MARC21XML-Infoscience"
    };
    Z.Utilities.HTTP.doGet(url, extract_author_data, null, null, headers);
}

function extract_lab_data(text) {
    Z.debug("About to load Infoscience lab records.");
    infoscience_labs = JSON.parse(text);
    Z.debug(infoscience_labs["SISB"]);
    // Then we proceed with retrieving the author records as JSON
    download_infoscience_authors();
}

function download_infoscience_labs() {
    Z.debug("About to fetch Infoscience author records.");
    var url = 'https://sisbsrv2.epfl.ch/static/infoscience_labs.json';
    var headers = {
        'User-Agent': "MARC21XML-Infoscience"
    };
    Z.Utilities.HTTP.doGet(url, extract_lab_data, null, null, headers);
}


function doExport() {
    download_infoscience_labs();
}