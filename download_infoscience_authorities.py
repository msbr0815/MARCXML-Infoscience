#!/usr/bin/python3

import requests
import io
import json
import zipfile

import pymarc

def api_key:
    with open (".authfile", "r") as authfile:
        return authfile.readlines()

def json2js(json_string, functionname='getData'):
    """function converting json string to javascript code: json_data -> json_data.js
    :param jsonfilepath: path to json file
    :param functionname: name of javascript function which will return the data
    :return None
    """
    output = ""
    # load json data
    data = json_string
    # write transformed javascript file
    output += 'function ' + functionname + '()\n{\n return '
    output += data + ';\n}'

    return output


def getIndexPositions(listOfElements, element):
    ''' Returns the indexes of all occurrences of give element in
    the list- listOfElements '''
    indexPosList = []
    indexPos = 0
    while True:
        try:
            # Search for item in list from indexPos to the end of list
            indexPos = listOfElements.index(element, indexPos)
            # Add the index position in list
            indexPosList.append(indexPos)
            indexPos += 1
        except ValueError as e:
            break

    return indexPosList


def download_infoscience_authors():

    authors = dict()
    search_url = "https://infoscience.epfl.ch/api/v1/search?p=&cc=People&c=People&format=files"
    #search_url = "https://infoscience.epfl.ch/api/v1/search?p=Shchutska&cc=People&c=People&format=files"
    headers = {'User-Agent': 'Custom FORCE_SCRIPT_NAME = None', 'Authorization': api_key()}
    r = requests.get(search_url, headers=headers, stream=True)
    data = r.content
    dump = open('dump.dat', 'wb')
    dump.write(data)
    dump.close()
    z = zipfile.ZipFile(io.BytesIO(data))
    for x in z.infolist():
        names = []
        labs = []
        if x.filename.find('metadata.xml') > 0:
            metadata = z.read(x.filename)
            pseudofile = io.StringIO(metadata.decode('utf-8'))
            records = pymarc.parse_xml_to_array(pseudofile)
            try:
                names.append(records[0]['100']['a'])
                sciper = records[0]['935']['a']
            except:
                print('Extracting names:',inspire_recid,records[0].as_json(indent=2))
                sciper = ''
            for field in records[0].fields:
                if field.tag == '001':
                    recid = field.data
                if field.tag == '400':
                    names.append(field.subfields[1])
                if field.tag == '790':
                    codes = field.subfields[0:len(field.subfields):2]
                    values = field.subfields[1:len(field.subfields):2]
                    labs_positions = getIndexPositions(codes, 'a')
                    labs = [values[k] for k in labs_positions]
                    # print(labs)
            for name in names:
                if name not in authors:
                    authors[name] = [(sciper, recid, labs)]
                else:
                    if (sciper, recid) != authors[name][0:2]:
                        print(recid, name, 'already in database:', authors[name])
                        authors[name].append((sciper, recid, labs))
    return authors


def download_infoscience_labs():

    labs = dict()
    search_url = "https://infoscience.epfl.ch/api/v1/search?p=&cc=Lab&c=Lab&format=files"
    #search_url = "https://infoscience.epfl.ch/api/v1/search?p=Shchutska&cc=People&c=People&format=files"
    headers = {'User-Agent': 'Custom FORCE_SCRIPT_NAME = None', 'Authorization': api_key()}
    r = requests.get(search_url, headers=headers, stream=True)
    data = r.content
    dump = open('dump.dat', 'wb')
    dump.write(data)
    dump.close()
    z = zipfile.ZipFile(io.BytesIO(data))
    for x in z.infolist():
        if x.filename.find('metadata.xml') > 0:
            recid = ""
            lab_code = ""
            lab_uid = ""
            liaison_librarian = "Unknown"
            infoscience_manager = ""
            metadata = z.read(x.filename)
            pseudofile = io.StringIO(metadata.decode('utf-8'))
            records = pymarc.parse_xml_to_array(pseudofile)
            for field in records[0].fields:
                if field.tag == '001':
                    recid = field.data
                if field.tag > '010':
                    codes = field.subfields[0:len(field.subfields):2]
                    values = field.subfields[1:len(field.subfields):2]
                    field_subfields = dict(zip(codes, values))
                    if field.tag == '195':
                        lab_code = field_subfields['a']
                    if field.tag == '371':
                        lab_uid = field_subfields['g']
                    if field.tag == '270':
                        try:
                            infoscience_manager = field_subfields['m']
                        except KeyError:
                            print('manager', field)
                    if field.tag == '271':
                        try:
                            liaison_librarian = field_subfields['p']
                        except KeyError:
                            print('liaison', field)
            labs[lab_code] = {'uid': lab_uid, 'recid': recid, 'manager': infoscience_manager, 'liaison': liaison_librarian}

    return labs


if __name__ == '__main__':
    labs = download_infoscience_labs()
    outfile = open('infoscience_labs.json', 'w')
    outfile.write(json.dumps(labs, sort_keys=True, indent=2))
    outfile.close()

    authors = download_infoscience_authors()
    outfile = open('infoscience_authors.json', 'w')
    outfile.write(json.dumps(authors, sort_keys=True, indent=2))
    outfile.close()
