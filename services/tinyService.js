const axios = require('axios');
const { getValidToken } = require('./tinyAuth'); 
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

    if (cpfLimpo) {
        try {
            const resBusca = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?cpf_cnpj=${cpfLimpo}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (resBusca.data.data && resBusca.data.data.length > 0) {
                idContato = resBusca.data.data[0].id;
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
// 🚀 FUNÇÃO 2: ENVIAR PEDIDO (TRAVA DE SEGURANÇA ID vs CÓDIGO)
// =================================================================
async function enviarPedidoParaTiny(pedido) {
    try {
        console.log(`🤖 Service: Processando Pedido...`);
        const token = await getValidToken();

        const idContato = await resolverCliente(pedido, token);
        if (!idContato) throw new Error("Não foi possível identificar o cliente no Tiny.");

        await sleep(1000); 

        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
        let somaProdutosBase = 0;

        console.log("🔍 MAPEANDO ITENS...");

        const itensFormatados = await Promise.all(listaItens.map(async (item) => {
            
            // 1. Tenta pegar o Tiny ID real (que deve ser um número grande)
            let idParaTiny = item.tinyId || item.id_tiny;
            const idLocal = item.id || item.produtoId;

            // Busca no banco se faltar
            if (!idParaTiny && idLocal) {
                try {
                    const prodDb = await prisma.produto.findUnique({ where: { id: parseInt(idLocal) } });
                    if (prodDb && prodDb.tinyId) idParaTiny = prodDb.tinyId;
                } catch (errDb) {}
            }

            const qtd = parseFloat(item.qtd || item.quantidade || 1);
            const unitario = parseFloat(item.preco || item.unitario || item.valor_unitario || 0);
            somaProdutosBase += (qtd * unitario);
            const valorFinalUnitario = unitario > 0 ? unitario : 0.01;

            // 🔥 A GRANDE CORREÇÃO: DECIDIR ENTRE 'ID' E 'CODIGO' 🔥
            let objetoProduto = {};
            
            // Só usamos o campo "ID" se ele for DIFERENTE do ID Local.
            // Se idParaTiny for "55" e idLocal for "55", é óbvio que é um SKU, não um ID interno.
            const ehIdReal = idParaTiny && String(idParaTiny) !== String(idLocal);

            if (ehIdReal) {
                console.log(`   ✅ ID Tiny Real Detectado: ${idParaTiny}`);
                objetoProduto = { id: parseInt(idParaTiny) };
            } else {
                // Se não temos ID Real, mandamos o ID Local como CÓDIGO (SKU)
                // O Tiny vai procurar pelo campo 'Código' lá no cadastro do produto
                const codigoFinal = String(item.referencia || idLocal);
                console.log(`   ⚠️ Enviando como CÓDIGO (SKU): ${codigoFinal}`);
                
                objetoProduto = { 
                    codigo: codigoFinal,
                    descricao: item.nome || "Produto Site"
                };
            }

            return {
                produto: objetoProduto,
                quantidade: qtd,
                valorUnitario: valorFinalUnitario
            };
        }));

        const totalPago = parseFloat(pedido.valorTotal); 
        const frete = 0; 
        
        let valorOutrasDespesas = 0;
        let diferenca = totalPago - (somaProdutosBase + frete);
        if (diferenca > 0.05) valorOutrasDespesas = parseFloat((diferenca).toFixed(2));
        
        let valorDesconto = 0;
        if (diferenca < -0.05) valorDesconto = parseFloat(Math.abs(diferenca).toFixed(2));

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