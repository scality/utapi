async function fetchRecords(warp10, className, labels, params, decodeMacro = '@utapi/decodeRecord') {
    const _labels = warp10._client.formatLabels(labels);
    const _params = Object.entries(params).map(([k, v]) => `'${k}' ${v}`).join('\n');
    const script = `
    DROP DROP
    {
        'token' '${warp10._readToken}'
        'selector' '${className}${_labels}'
        ${_params}
    } FETCH
    <%
        DUP LABELS 'labels' STORE
        [ SWAP
        VALUES
        <% ${decodeMacro} %> FOREACH
        ] 'values' STORE
        { 'labels' $labels 'values' $values }
    %> FOREACH
    DEPTH ->LIST
    ->JSON`;
    const resp = await warp10.exec({
        script,
    });
    return JSON.parse(resp.result[0]);
}

module.exports = { fetchRecords };
