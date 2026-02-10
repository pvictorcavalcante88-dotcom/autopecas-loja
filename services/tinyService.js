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
                } catch (e) { console.error("⚠️ Erro update cliente:", e.message); }
                
                return idContato;
            }
        } catch (e) {}
    }

    // 2. SE NÃO ACHOU, CRIA UM NOVO (POST)
    try {
        console.log("🆕 Criando novo cliente...");
        const resCriar = await axios.post(
            `https://api.tiny.com.br/public-api/v3/contatos`, 
            dadosCliente, 
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        return resCriar.data.data?.id || resCriar.data.id;

    } catch (error) {
        console.error("❌ ERRO CLIENTE TINY:", JSON.stringify(error.response?.data || error.message, null, 2));
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
        if (!idContato) throw new Error("Não foi possível identificar o cliente no Tiny.");

        // 2. Prepara Itens (COM A LÓGICA DE ID DO BANCO)
        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
        let somaProdutosBase = 0;

        const itensFormatados = await Promise.all(listaItens.map(async (item) => {
            // AQUI ESTÁ A LÓGICA QUE VOCÊ QUERIA:
            let idFinal = item.tinyId; // Tenta pegar direto se vier do front
            
            // Se não tiver, busca no banco pelo ID do produto
            if (!idFinal && item.id) {
                const prodDb = await prisma.produto.findUnique({ where: { id: parseInt(item.id) } });
                if (prodDb) idFinal = prodDb.tinyId;
            }
            
            // Se ainda não tiver, usa o ID local como fallback
            if (!idFinal) idFinal = item.id || item.produtoId;

            const qtd = parseFloat(item.qtd || item.quantidade || 1);
            // Pega o preço de qualquer campo possível
            const unitario = parseFloat(item.preco || item.unitario || item.valor_unitario || 0);
            
            somaProdutosBase += (qtd * unitario);
            const valorFinalUnitario = unitario > 0 ? unitario : 0.01;

            return {
                // 🚨 A CORREÇÃO DO ERRO ESTÁ AQUI: parseInt()
                produto: { id: parseInt(idFinal) }, 
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
            situacao: 1, // Aberto
            obs: `Pedido Site. Pagamento: ${pedido.metodoPagamento}.`,
            
            // Garante endereço na nota
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