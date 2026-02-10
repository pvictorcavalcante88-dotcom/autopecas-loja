// ... (Mantenha os imports e a função resolverCliente iguais) ...

// =================================================================
// 🚀 FUNÇÃO 2: ENVIAR PEDIDO (COM DEBUG DE ID DE PRODUTO)
// =================================================================
async function enviarPedidoParaTiny(pedido) {
    try {
        console.log(`🤖 Service: Processando Pedido...`);
        const token = await getValidToken();

        // 1. Resolve Cliente
        const idContato = await resolverCliente(pedido, token);
        if (!idContato) throw new Error("Não foi possível identificar o cliente no Tiny.");

        await sleep(1000); 

        // 2. Prepara Itens e Investiga o ID
        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
        let somaProdutosBase = 0;

        console.log("🔍 INVESTIGAÇÃO DOS ITENS:");

        const itensFormatados = await Promise.all(listaItens.map(async (item) => {
            
            // Passo A: O que veio do Frontend?
            console.log(`   🔸 Item Front: Nome=${item.nome || '?'} | ID Local=${item.id} | TinyID Front=${item.tinyId}`);

            let idFinal = item.tinyId || item.id_tiny; 
            
            // Passo B: Se não veio TinyID, busca no Banco Local
            if (!idFinal && item.id) {
                console.log(`   ❓ TinyID não veio do front. Buscando no banco pelo ID Local: ${item.id}...`);
                const prodDb = await prisma.produto.findUnique({ where: { id: parseInt(item.id) } });
                
                if (prodDb) {
                    console.log(`   ✅ Produto encontrado no Banco: ${prodDb.titulo}`);
                    console.log(`   💾 TinyID salvo no Banco: ${prodDb.tinyId}`);
                    idFinal = prodDb.tinyId;
                } else {
                    console.log(`   ❌ Produto não encontrado no banco local!`);
                }
            }
            
            // Fallback
            if (!idFinal) idFinal = item.id;

            console.log(`   🚀 ID FINAL ENVIADO AO TINY: ${idFinal}`);

            const qtd = parseFloat(item.qtd || item.quantidade || 1);
            const unitario = parseFloat(item.preco || item.unitario || item.valor_unitario || 0);
            
            somaProdutosBase += (qtd * unitario);
            const valorFinalUnitario = unitario > 0 ? unitario : 0.01;

            return {
                produto: { id: parseInt(idFinal) }, // O erro acontece se idFinal não existir no Tiny
                quantidade: qtd,
                valorUnitario: valorFinalUnitario
            };
        }));

        const totalPago = parseFloat(pedido.valorTotal); 
        const frete = 0; 
        let diferenca = parseFloat((totalPago - (somaProdutosBase + frete)).toFixed(2));
        let valorOutrasDespesas = diferenca > 0 ? diferenca : 0;
        let valorDesconto = diferenca < 0 ? Math.abs(diferenca) : 0;

        const payload = {
            data: new Date().toISOString().split('T')[0],
            idContato: idContato,
            itens: itensFormatados,
            naturezaOperacao: { id: 335900648 },
            valorFrete: frete,
            valorOutrasDespesas: valorOutrasDespesas, 
            valorDesconto: valorDesconto, 
            situacao: 1, 
            obs: `Pedido Site. Pagamento: ${pedido.metodoPagamento}.`,
            enderecoEntrega: {
                tipoPessoa: (pedido.clienteDoc && pedido.clienteDoc.length > 11) ? "J" : "F",
                cpfCnpj: (pedido.clienteDoc || "").replace(/\D/g, ''),
                endereco: pedido.clienteEndereco,
                numero: pedido.clienteNumero || "S/N",
                bairro: pedido.clienteBairro || "Centro",
                municipio: pedido.clienteCidade || "Maceio", 
                cep: (pedido.clienteCep || "").replace(/\D/g, ''),
                uf: pedido.clienteUf || "AL",
                pais: "Brasil"
            }
        };

        // RETRY LOGIC
        let response;
        try {
            response = await axios.post(`https://api.tiny.com.br/public-api/v3/pedidos`, payload, { headers: { 'Authorization': `Bearer ${token}` } });
        } catch (erroEnvio) {
            if (erroEnvio.response?.status === 429) {
                console.log("⏳ Tiny bloqueou (429). Tentando de novo em 5s...");
                await sleep(5000); 
                response = await axios.post(`https://api.tiny.com.br/public-api/v3/pedidos`, payload, { headers: { 'Authorization': `Bearer ${token}` } });
            } else {
                throw erroEnvio;
            }
        }

        const dados = response.data.data || response.data;
        console.log(`✅ Pedido Criado no Tiny: ${dados.numero}`);
        
        return { success: true, tinyId: dados.id, numero: dados.numero };

    } catch (error) {
        const msg = error.response?.data?.detalhes || error.response?.data || error.message;
        console.error("❌ Erro Service Tiny:", JSON.stringify(msg, null, 2));
        return { success: false, erro: msg };
    }
}

module.exports = { enviarPedidoParaTiny };