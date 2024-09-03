var tableData = [];
var pdfFiles = [];
var xmlFiles = [];

document.getElementById("cargarCatalogo").addEventListener("click", triggerFileInput);
document.getElementById("fileInput").addEventListener("change", handleFileInputChange);
document.getElementById("descargarArchivos").addEventListener("click", descargarArchivos);

function triggerFileInput() {
    document.getElementById("fileInput").click();
}

async function handleFileInputChange(event) {
    var files = event.target.files;
    console.log(`Número de archivos seleccionados: ${files.length}`);
    if (files.length > 0) {
        tableData = [];
        pdfFiles = [];
        xmlFiles = [];
        tableData.push(["Fecha", "No.Factura", "Empresa", "Nit", "CUFE", "SubTotal", "IVA", "Total", "Nombre Item"]);
        const filePromises = Array.from(files).map(file => readZipFile(file));
        await Promise.all(filePromises);
        renderTable();
    }
}

function readZipFile(file) {
    return new Promise((resolve, reject) => {
        JSZip.loadAsync(file)
            .then(zip => {
                zip.forEach((relativePath, zipEntry) => {
                    zipEntry.async("blob").then(blob => {
                        if (relativePath.endsWith(".xml")) {
                            readXmlFile(blob, zipEntry.name);
                            xmlFiles.push({ name: zipEntry.name, content: blob });
                        } else if (relativePath.endsWith(".pdf")) {
                            pdfFiles.push({ name: zipEntry.name, content: blob });
                        }
                    });
                });
                resolve();
            })
            .catch(error => {
                console.error(`Error procesando archivo ZIP: ${file.name}`, error);
                reject(error);
            });
    });
}

function readXmlFile(file, fileName) {
    var reader = new FileReader();
    reader.onload = function(e) {
        var xmlContent = e.target.result;
        try {
            procesarXML(xmlContent, fileName);
        } catch (error) {
            console.error("Error procesando archivo XML", error);
        }
    };
    reader.readAsText(file);
}

function procesarXML(xmlContent, fileName) {
    var parser = new DOMParser();
    var docXML = parser.parseFromString(xmlContent, "application/xml");

    var descriptionElement = docXML.getElementsByTagName("cbc:Description")[0];
    if (!descriptionElement) {
        console.error("El elemento cbc:Description no se encontró en el XML.");
        return;
    }
    var cdataContent = descriptionElement.textContent;

    var innerDoc = parser.parseFromString(cdataContent, "application/xml");

    var issueDate = getElementTextContent(innerDoc, "cbc:IssueDate", "N/A");
    var parentDocumentID = getElementTextContent(innerDoc, "cbc:ID", "N/A");
    var taxableAmount = parseFloat(getElementTextContent(innerDoc, "cbc:TaxExclusiveAmount", "0.00"));
    var taxAmount = parseFloat(getElementTextContent(innerDoc, "cbc:TaxAmount", "0.00"));
    var payableAmount = parseFloat(getElementTextContent(innerDoc, "cbc:PayableAmount", "0.00"));
    var senderParty = innerDoc.getElementsByTagName("cac:AccountingSupplierParty")[0];
    var cufe = getElementTextContent(innerDoc, "cbc:UUID", "N/A");
    if (!senderParty) {
        console.error("El elemento cac:AccountingSupplierParty no se encontró en el XML.");
        return;
    }
    var registrationName = getElementTextContent(senderParty, "cbc:RegistrationName", "N/A");
    var companyID = getElementTextContent(senderParty, "cbc:CompanyID", "N/A");

    var xmlFileNameWithoutExtension = fileName.replace(".xml", "");

    tableData.push([issueDate, parentDocumentID, registrationName, companyID, cufe, taxableAmount, taxAmount, payableAmount, xmlFileNameWithoutExtension]);
    renderTable();
}

function getElementTextContent(parent, tagName, defaultValue) {
    return parent.getElementsByTagName(tagName)[0]?.textContent || defaultValue;
}

function formatCurrency(value) {
    var amount = parseFloat(value);
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(amount);
}

function renderTable() {
    var tablaHTML = `<h2>Factura</h2><table><tr><th>Fecha</th><th>No.Factura</th><th>Empresa</th><th>Nit</th><th>CUFE</th><th>SubTotal</th><th>IVA</th><th>Total</th><th>Nombre Item</th></tr>`;
    tableData.slice(1).forEach(row => {
        tablaHTML += `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
    });
    tablaHTML += `</table>`;
    document.getElementById("tablasContainer").innerHTML = tablaHTML;
}

function exportToExcel() {
    if (tableData.length === 0) {
        alert("Por favor, cargue archivos XML primero.");
        return;
    }

    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(tableData);
    styleSheet(ws);
    XLSX.utils.book_append_sheet(wb, ws, "Catalogo");
    XLSX.writeFile(wb, "Resumen.xlsx");
}

function styleSheet(ws) {
    ws['!cols'] = [
        { wpx: 120 },
        { wpx: 120 }, 
        { wpx: 200 }, 
        { wpx: 150 }, 
        { wpx: 150 },
        { wpx: 200 }  
    ];

    var headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "FFFF00" } }, alignment: { horizontal: "center" } };
    var borderStyle = { border: { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } } };

    for (var cell in ws) {
        if (cell[0] === '!' || ws[cell].v === undefined) continue;
        ws[cell].s = ws[cell].s || {};
        if (cell.match(/^[A-G]1$/)) {
            Object.assign(ws[cell].s, headerStyle);
        }
        Object.assign(ws[cell].s, borderStyle);
    }
}

function descargarArchivos() {
    if (tableData.length === 0 || pdfFiles.length === 0 || xmlFiles.length === 0) {
        alert("Por favor, cargue archivos ZIP primero.");
        return;
    }

    var zip = new JSZip();

    // Añadir PDFs al ZIP
    var pdfFolder = zip.folder("PDFs");
    pdfFiles.forEach(file => {
        pdfFolder.file(file.name, file.content);
    });

    // Añadir XMLs al ZIP
    var xmlFolder = zip.folder("XMLs");
    xmlFiles.forEach(file => {
        xmlFolder.file(file.name, file.content);
    });

    // Crear el archivo Excel
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(tableData);
    styleSheet(ws);
    XLSX.utils.book_append_sheet(wb, ws, "Resumen");
    var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
    function s2ab(s) {
        var buf = new ArrayBuffer(s.length);
        var view = new Uint8Array(buf);
        for (var i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
        return buf;
    }
    zip.file("Resumen.xlsx", s2ab(wbout), { binary: true });

    // Descargar el ZIP
    zip.generateAsync({ type: "blob" }).then(function(content) {
        saveAs(content, "archivos.zip");
    });
}
