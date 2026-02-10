const axios = require('axios');
const { getValidToken } = require('./tinyAuth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// =================================================================
// 🕵️ FUNÇÃO 1: RESOLVER CLIENTE (BUSCAR -> SE EXISTIR, ATUALIZA)
// =================================================================
async function resolverCliente(pedido, token) {
    const cpfLimpo = (pedido.clienteDoc || '').replace(/\D/g, '');
    const nome = pedido.clienteNome;

    // 📦 MONTAGEM DO JSON (Baseado na Documentação V3 que você enviou)
    const dadosCliente = {
        nome: nome,
        cpfCnpj: cpfLimpo,
        tipoPessoa: cpfLimpo.length > 11 ? 'J' : 'F',
        situacao: "A", // A = Ativo
        fone: pedido.clienteTelefone,
        email: pedido.clienteEmail,
        
        // ✅ AQUI ESTÁ A ESTRUTURA DO CURL DO PUT/POST
        endereco: {
            endereco: pedido.clienteEndereco,
            numero: pedido.clienteNumero || "S/N",
            complemento: "",
            bairro: pedido.clienteBairro || "Centro",
            municipio: pedido.clienteCidade || "Maceio", // V3 exige 'municipio'
            cep: (pedido.clienteCep || "").replace(/\D/g, ''),
            uf: pedido.clienteUf || "AL",
            pais: "Brasil"
        }
    };

    let idContato = null;

    // 1. TENTATIVA: BUSCAR POR CPF
    if (cpfLimpo) {
        try {
            const resBusca = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?cpf_cnpj=${cpfLimpo}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (resBusca.data.data && resBusca.data.data.length > 0) {
                idContato = resBusca.data.data[0].id;
                console.log(`🔎 Cliente encontrado (ID: ${idContato}). Atualizando dados conforme documentação...`);
                
                // 🔥 O PULO DO GATO: PUT (ATUALIZAR)
                // Usa o ID encontrado para preencher o endereço que faltava
                    try {
                        console.log("🆕 Cliente não existe. Criando novo...");

                        // 🕵️ LOG ESPIÃO 1: O que estamos enviando?
                        console.log("📦 PAYLOAD ENVIADO AO TINY:", JSON.stringify(dadosCliente, null, 2));

                        const resCriar = await axios.post(
                            `https://api.tiny.com.br/public-api/v3/contatos`, 
                            dadosCliente, 
                            { headers: { 'Authorization': `Bearer ${token}` } }
                        );
                        return resCriar.data.data?.id || resCriar.data.id;

                    } catch (error) {
                        // 🕵️ LOG ESPIÃO 2: Por que o Tiny recusou?
                        console.error("❌ ERRO DETALHADO DO TINY:", JSON.stringify(error.response?.data || error.message, null, 2));

                        console.log("⚠️ Erro ao criar. Tentando buscar por nome como última chance...");
                        try {
                            const resBuscaNome = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?pesquisa=${encodeURIComponent(nome)}`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            return resBuscaNome.data.data?.[0]?.id;
                        } catch (e) { return null; }
                    }
                
                return idContato;
            }
        } catch (e) {
            console.log("Erro na busca por CPF:", e.message);
        }
    }

    // 2. SE NÃO ACHOU, CRIA UM NOVO (POST)
    try {
        console.log("🆕 Cliente não existe. Criando novo...");
        const resCriar = await axios.post(
            `https://api.tiny.com.br/public-api/v3/contatos`, 
            dadosCliente, 
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        return resCriar.data.data?.id || resCriar.data.id;

    } catch (error) {
        console.log("⚠️ Erro ao criar. Tentando buscar por nome como última chance...");
        try {
            const resBuscaNome = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?pesquisa=${encodeURIComponent(nome)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return resBuscaNome.data.data?.[0]?.id;
        } catch (e) { return null; }
    }
}

// =================================================================
// 🚀 FUNÇÃO 2: ENVIAR PEDIDO
// =================================================================
async function enviarPedidoParaTiny(pedido) {
    try {
        console.log(`🤖 Service: Iniciando envio do Pedido #${pedido.id}...`);
        
        const token = await getValidToken();

        // 1. Resolve (e agora ATUALIZA) o Cliente
        const idContato = await resolverCliente(pedido, token);
        if (!idContato) throw new Error("Não foi possível identificar o cliente no Tiny.");

        // 2. Prepara Itens
        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
        let somaProdutosBase = 0;

        const itensFormatados = await Promise.all(listaItens.map(async (item) => {
            let idFinal = item.tinyId;
            if (!idFinal && item.id) {
                const prodDb = await prisma.produto.findUnique({ where: { id: parseInt(item.id) } });
                if (prodDb) idFinal = prodDb.tinyId;
            }
            if (!idFinal) idFinal = String(item.id || item.produtoId);

            const qtd = parseFloat(item.qtd || item.quantidade || 1);
            const unitario = parseFloat(item.unitario || item.valor_unitario || 0);
            
            somaProdutosBase += (qtd * unitario);

            return {
                produto: { id: String(idFinal) },
                quantidade: qtd,
                valorUnitario: unitario
            };
        }));

        // 3. Cálculos Financeiros
        const totalPagoNoCartao = parseFloat(pedido.valorTotal); 
        const valorFrete = 0; 
        let diferenca = parseFloat((totalPagoNoCartao - (somaProdutosBase + valorFrete)).toFixed(2));
        let valorOutrasDespesas = diferenca > 0 ? diferenca : 0;
        let valorDesconto = diferenca < 0 ? Math.abs(diferenca) : 0;

        // 4. Monta Payload do Pedido V3
        const payload = {
            data: new Date().toISOString().split('T')[0],
            idContato: idContato,
            itens: itensFormatados,
            naturezaOperacao: { id: 335900648 },
            valorFrete: valorFrete,
            valorOutrasDespesas: valorOutrasDespesas, 
            valorDesconto: valorDesconto, 
            situacao: 1, // 1 = Aberto
            obs: `Pedido #${pedido.id}. Pagamento: ${pedido.metodoPagamento}.`,

            // Reforço: Mandamos o endereço também no pedido para garantir a NFe
            enderecoEntrega: {
                tipoPessoa: (pedido.clienteDoc && pedido.clienteDoc.length > 11) ? "J" : "F",
                cpfCnpj: (pedido.clienteDoc || "").replace(/\D/g, ''),
                endereco: pedido.clienteEndereco,
                numero: pedido.clienteNumero || "S/N",
                complemento: "",
                bairro: pedido.clienteBairro || "Centro",
                municipio: pedido.clienteCidade || "Maceio", 
                cep: (pedido.clienteCep || "00000000").replace(/\D/g, ''),
                uf: pedido.clienteUf || "AL",
                pais: "Brasil"
            }
        };

        // 5. Envia Pedido
        const response = await axios.post(
            `https://api.tiny.com.br/public-api/v3/pedidos`, 
            payload,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        const dadosResposta = response.data.data || response.data;
        const idTinyPedido = dadosResposta?.id;
        const numeroTiny = dadosResposta?.numero;

        console.log(`✅ Sucesso Tiny! ID: ${idTinyPedido} | Nota: ${numeroTiny}`);

        // 6. Atualiza Banco Local
        await prisma.pedido.update({
            where: { id: pedido.id },
            data: { tinyId: String(idTinyPedido), numeroNota: String(numeroTiny) }
        });

        return { success: true, tinyId: idTinyPedido };

    } catch (error) {
        const msg = error.response?.data?.detalhes || error.response?.data || error.message;
        console.error("❌ Erro Service Tiny:", JSON.stringify(msg, null, 2));
        return { success: false, erro: msg };
    }
}

module.exports = { enviarPedidoParaTiny };