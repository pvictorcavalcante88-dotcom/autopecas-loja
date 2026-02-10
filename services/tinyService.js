const axios = require('axios');
const { getValidToken } = require('./tinyAuth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Função de espera (Paciência)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// =================================================================
// 🕵️ FUNÇÃO 1: RESOLVER CLIENTE (COM SISTEMA ANTI-BLOQUEIO 429)
// =================================================================
async function resolverCliente(pedido, token) {
    const cpfLimpo = (pedido.clienteDoc || '').replace(/\D/g, '');
    const nome = pedido.clienteNome;

    // Dados completos (com Endereço e Município)
    const dadosCliente = {
        nome: nome,
        cpfCnpj: cpfLimpo,
        tipoPessoa: cpfLimpo.length > 11 ? 'J' : 'F',
        situacao: "A",
        fone: pedido.clienteTelefone,
        email: pedido.clienteEmail,
        endereco: {
            endereco: pedido.clienteEndereco,
            numero: pedido.clienteNumero || "S/N",
            complemento: "",
            bairro: pedido.clienteBairro || "Centro",
            municipio: pedido.clienteCidade || "Maceio", 
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
                console.log(`🔎 Cliente encontrado (ID: ${idContato}). Atualizando endereço...`);
                
                // PUT: Atualiza o cadastro existente
                try {
                    await axios.put(
                        `https://api.tiny.com.br/public-api/v3/contatos/${idContato}`, 
                        dadosCliente,
                        { headers: { 'Authorization': `Bearer ${token}` } }
                    );
                } catch (e) { 
                    // Se der erro 429 no PUT, esperamos e tentamos uma vez mais
                    if(e.response?.status === 429) {
                        console.log("⏳ Tiny pediu calma (429). Esperando 3s para atualizar...");
                        await sleep(3000);
                        try {
                             await axios.put(`https://api.tiny.com.br/public-api/v3/contatos/${idContato}`, dadosCliente, { headers: { 'Authorization': `Bearer ${token}` } });
                        } catch(e2) {}
                    }
                }
                
                return idContato;
            }
        } catch (e) {}
    }

    // 2. SE NÃO ACHOU, CRIA UM NOVO (POST) - COM RETRY
    try {
        console.log("🆕 Criando novo cliente...");
        const resCriar = await axios.post(
            `https://api.tiny.com.br/public-api/v3/contatos`, 
            dadosCliente, 
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        return resCriar.data.data?.id || resCriar.data.id;

    } catch (error) {
        // 🔥 TRATAMENTO DE ERRO 429 (MUITAS REQUISIÇÕES)
        if (error.response?.status === 429) {
            console.log("🛑 ERRO 429: Bloqueio temporário do Tiny. Respirando por 4 segundos...");
            await sleep(4000); // Espera 4 segundos
            
            try {
                console.log("🔄 Tentando criar cliente novamente...");
                const resRetry = await axios.post(
                    `https://api.tiny.com.br/public-api/v3/contatos`, 
                    dadosCliente, 
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                return resRetry.data.data?.id || resRetry.data.id;
            } catch (retryError) {
                console.error("❌ Falha na segunda tentativa:", retryError.message);
            }
        }

        console.error("❌ ERRO CLIENTE TINY DETALHADO:", JSON.stringify(error.response?.data || error.message, null, 2));
        
        // Fallback: busca por nome
        try {
            const resBuscaNome = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?pesquisa=${encodeURIComponent(nome)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return resBuscaNome.data.data?.[0]?.id;
        } catch (e) { return null; }
    }
}

// =================================================================
// 🚀 FUNÇÃO 2: ENVIAR PEDIDO (COM CORREÇÃO DE ID INT)
// =================================================================
async function enviarPedidoParaTiny(pedido) {
    try {
        console.log(`🤖 Service: Processando Pedido...`);
        const token = await getValidToken();

        // 1. Resolve Cliente
        const idContato = await resolverCliente(pedido, token);
        if (!idContato) throw new Error("Não foi possível identificar o cliente no Tiny (Erro ou 429).");

        // 2. Prepara Itens (COM A LÓGICA DE ID DO BANCO E VALOR)
        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
        let somaProdutosBase = 0;

        const itensFormatados = await Promise.all(listaItens.map(async (item) => {
            let idFinal = item.tinyId;
            if (!idFinal && item.id) {
                const prodDb = await prisma.produto.findUnique({ where: { id: parseInt(item.id) } });
                if (prodDb) idFinal = prodDb.tinyId;
            }
            if (!idFinal) idFinal = item.id || item.produtoId;

            const qtd = parseFloat(item.qtd || item.quantidade || 1);
            // Pega o preço (prioridade: preco > unitario > valor_unitario)
            const unitario = parseFloat(item.preco || item.unitario || item.valor_unitario || 0);
            
            somaProdutosBase += (qtd * unitario);
            const valorFinalUnitario = unitario > 0 ? unitario : 0.01;

            return {
                produto: { id: parseInt(idFinal) }, // ID como Inteiro
                quantidade: qtd,
                valorUnitario: valorFinalUnitario
            };
        }));

        // 3. Cálculos Financeiros
        const totalPago = parseFloat(pedido.valorTotal); 
        const frete = 0; 
        let diferenca = parseFloat((totalPago - (somaProdutosBase + frete)).toFixed(2));
        let valorOutrasDespesas = diferenca > 0 ? diferenca : 0;
        let valorDesconto = diferenca < 0 ? Math.abs(diferenca) : 0;

        // 4. Payload
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

        const response = await axios.post(
            `https://api.tiny.com.br/public-api/v3/pedidos`, 
            payload,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

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