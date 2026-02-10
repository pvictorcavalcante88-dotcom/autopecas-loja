const axios = require('axios');
// 👇 ESSA LINHA AQUI QUE ESTAVA FALTANDO:
const { getValidToken } = require('./tinyAuth'); 
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Função de espera (Paciência para o erro 429)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// =================================================================
// 🕵️ FUNÇÃO 1: RESOLVER CLIENTE
// =================================================================
async function resolverCliente(pedido, token) {
    const cpfLimpo = (pedido.clienteDoc || '').replace(/\D/g, '');
    const nome = pedido.clienteNome;

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
                // Tenta atualizar o endereço (PUT)
                try {
                    await axios.put(`https://api.tiny.com.br/public-api/v3/contatos/${idContato}`, dadosCliente, { headers: { 'Authorization': `Bearer ${token}` } });
                } catch (e) { if(e.response?.status === 429) await sleep(2000); }
                return idContato;
            }
        } catch (e) {}
    }

    // 2. SE NÃO ACHOU, CRIA UM NOVO (POST)
    try {
        const resCriar = await axios.post(`https://api.tiny.com.br/public-api/v3/contatos`, dadosCliente, { headers: { 'Authorization': `Bearer ${token}` } });
        return resCriar.data.data?.id || resCriar.data.id;
    } catch (error) {
        if (error.response?.status === 429) {
            await sleep(3000);
            try {
                const resRetry = await axios.post(`https://api.tiny.com.br/public-api/v3/contatos`, dadosCliente, { headers: { 'Authorization': `Bearer ${token}` } });
                return resRetry.data.data?.id || resRetry.data.id;
            } catch (e) {}
        }
        try {
            const resBuscaNome = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?pesquisa=${encodeURIComponent(nome)}`, { headers: { 'Authorization': `Bearer ${token}` } });
            return resBuscaNome.data.data?.[0]?.id;
        } catch (e) { return null; }
    }
}

// =================================================================
// 🚀 FUNÇÃO 2: ENVIAR PEDIDO (COM INVESTIGAÇÃO DE ID)
// =================================================================
async function enviarPedidoParaTiny(pedido) {
    try {
        console.log(`🤖 Service: Processando Pedido...`);
        
        // Agora vai funcionar porque importamos lá em cima!
        const token = await getValidToken();

        // 1. Resolve Cliente
        const idContato = await resolverCliente(pedido, token);
        if (!idContato) throw new Error("Não foi possível identificar o cliente no Tiny.");

        await sleep(1000); // Respira

        // 2. Prepara Itens e Investiga o ID
        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
        let somaProdutosBase = 0;

        console.log("🔍 INVESTIGAÇÃO DOS ITENS:");

        const itensFormatados = await Promise.all(listaItens.map(async (item) => {
            
            // Log para você ver o que está acontecendo
            console.log(`   🔸 Item Front: ID Local=${item.id} | TinyID Front=${item.tinyId}`);

            let idFinal = item.tinyId || item.id_tiny; 
            
            // Se não veio TinyID, busca no Banco Local
            if (!idFinal && item.id) {
                console.log(`   ❓ Buscando no banco pelo ID Local: ${item.id}...`);
                const prodDb = await prisma.produto.findUnique({ where: { id: parseInt(item.id) } });
                
                if (prodDb) {
                    console.log(`   ✅ Produto encontrado no Banco. TinyID salvo: ${prodDb.tinyId}`);
                    idFinal = prodDb.tinyId;
                } else {
                    console.log(`   ❌ Produto não encontrado no banco local!`);
                }
            }
            
            // Fallback (última tentativa)
            if (!idFinal) idFinal = item.id;

            console.log(`   🚀 ID FINAL QUE SERÁ ENVIADO AO TINY: ${idFinal}`);

            const qtd = parseFloat(item.qtd || item.quantidade || 1);
            const unitario = parseFloat(item.preco || item.unitario || item.valor_unitario || 0);
            
            somaProdutosBase += (qtd * unitario);
            const valorFinalUnitario = unitario > 0 ? unitario : 0.01;

            return {
                produto: { id: parseInt(idFinal) }, // ID como Inteiro
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

        // Retry Logic
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