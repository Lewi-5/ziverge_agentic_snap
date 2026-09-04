function renderTokenLine(line) {
    const prefix = line.kind === "context" ? " " : line.kind === "delete" ? "-" : "+";
    const rendered = `${prefix}${line.token}`;
    return line.token.endsWith("\n") ? rendered : `${rendered}\n\\ No newline at end of file\n`;
}
export function renderDiffPlain(records) {
    let output = "";
    for (const record of records) {
        if (record.kind === "binary") {
            output += `Binary files ${record.oldLabel} and ${record.newLabel} differ\n`;
            continue;
        }
        output += `--- ${record.oldLabel}\n`;
        output += `+++ ${record.newLabel}\n`;
        output += `@@ -1,${String(record.oldTokenCount)} +1,${String(record.newTokenCount)} @@\n`;
        for (const line of record.lines)
            output += renderTokenLine(line);
    }
    return output;
}
