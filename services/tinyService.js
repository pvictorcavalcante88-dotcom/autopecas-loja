const axios = require('axios');
const { getValidToken } = require('./tinyAuth'); 
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// =================================================================
// 🕵️ PARTE 1: CLIENTE E ENDEREÇO (Lógica Nova - A que funcionou!)
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

    if (cpfLimpo) {
        try {
            const resBusca = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?cpf_cnpj=${cpfLimpo}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (resBusca.data.data && resBusca.data.data.length > 0) {
                idContato = resBusca.data.data[0].id;
                // Atualiza endereço (PUT)
                try {
                    await axios.put(`https://api.tiny.com.br/public-api/v3/contatos/${idContato}`, dadosCliente, { headers: { 'Authorization': `Bearer ${token}` } });
                } catch (e) { if(e.response?.status === 429) await sleep(2000); }
                return idContato;
            }
        } catch (e) {}
    }

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
// 🚀 PARTE 2: PRODUTOS (Lógica Híbrida - Flexível)
// =================================================================
async function enviarPedidoParaTiny(pedido) {
    try {
        console.log(`🤖 Service: Processando Pedido...`);
        const token = await getValidToken();

        // 1. Resolve Cliente (Endereço garantido)
        const idContato = await resolverCliente(pedido, token);
        if (!idContato) throw new Error("Não foi possível identificar o cliente no Tiny.");

        await sleep(1000); 

        // 2. PREPARA ITENS (MISTURA DO ANTIGO COM O NOVO)
        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
        let somaProdutosBase = 0;

        console.log("🔍 MAPEANDO ITENS PARA O TINY...");

        const itensFormatados = await Promise.all(listaItens.map(async (item) => {
            
            // A. Busca ID Real no Banco (se disponível)
            let tinyIdReal = item.tinyId || item.id_tiny;
            if (!tinyIdReal && item.id) {
                const prodDb = await prisma.produto.findUnique({ where: { id: parseInt(item.id) } });
                if (prodDb) tinyIdReal = prodDb.tinyId;
            }

            const qtd = parseFloat(item.qtd || item.quantidade || 1);
            const unitario = parseFloat(item.preco || item.unitario || item.valor_unitario || 0);
            somaProdutosBase += (qtd * unitario);
            const valorFinalUnitario = unitario > 0 ? unitario : 0.01;

            // B. MONTAGEM DO OBJETO PRODUTO (O SEGREDINHO)
            // Se tiver o ID do Tiny, manda o ID.
            // Se NÃO tiver, manda o "Código" (usando o ID do banco como código, igual seu código antigo fazia)
            let objetoProduto = {};

            if (tinyIdReal) {
                console.log(`   ✅ Usando ID Tiny: ${tinyIdReal}`);
                objetoProduto = { id: parseInt(tinyIdReal) };
            } else {
                console.log(`   ⚠️ Sem ID Tiny. Usando Código/SKU: ${item.id}`);
                // Aqui imitamos seu código antigo: enviamos o ID local como "codigo"
                objetoProduto = { 
                    codigo: String(item.referencia || item.id),
                    descricao: item.nome || "Produto Sem Nome" // Fallback visual
                };
            }

            return {
                produto: objetoProduto,
                quantidade: qtd,
                valorUnitario: valorFinalUnitario
            };
        }));

        // 3. Cálculos Financeiros (Mantendo sua lógica de juros)
        const totalPago = parseFloat(pedido.valorTotal); 
        const frete = 0; 
        
        // Juros = Total Pago - (Soma Produtos + Frete)
        let valorOutrasDespesas = 0;
        if (totalPago > (somaProdutosBase + frete + 0.05)) {
            valorOutrasDespesas = parseFloat((totalPago - (somaProdutosBase + frete)).toFixed(2));
        }

        const payload = {
            data: new Date().toISOString().split('T')[0],
            idContato: idContato,
            itens: itensFormatados,
            naturezaOperacao: { id: 335900648 },
            valorFrete: frete,
            valorOutrasDespesas: valorOutrasDespesas, 
            situacao: 1, 
            obs: `Pedido Site. Pagamento: ${pedido.metodoPagamento}.`,
            
            // MANTEMOS O ENDEREÇO AQUI TAMBÉM (REDUNDÂNCIA DE SEGURANÇA)
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

        // Retry Logic (Anti-429)
        let response;
        try {
            response = await axios.post(`https://api.tiny.com.br/public-api/v3/pedidos`, payload, { headers: { 'Authorization': `Bearer ${token}` } });
        } catch (erroEnvio) {
            if (erroEnvio.response?.status === 429) {
                console.log("⏳ Tiny 429. Tentando de novo em 5s...");
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