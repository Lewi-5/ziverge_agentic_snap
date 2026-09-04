export function operationKind(operation) {
    if ("retain" in operation)
        return "retain";
    if ("delete" in operation)
        return "delete";
    return "insert";
}
