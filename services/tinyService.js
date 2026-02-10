const axios = require('axios');
const { getValidToken } = require('./tinyAuth'); // ✅ IMPORTAÇÃO CORRETA
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// =================================================================
// 🕵️ FUNÇÃO 1: RESOLVER CLIENTE (Lógica que garante o endereço)
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
                // Atualiza o endereço (PUT)
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
// 🚀 FUNÇÃO 2: ENVIAR PEDIDO (COM A LÓGICA DO PRISMA DA ROTA ANTIGA)
// =================================================================
async function enviarPedidoParaTiny(pedido) {
    try {
        console.log(`🤖 Service: Processando Pedido...`);
        const token = await getValidToken();

        // 1. Resolve Cliente
        const idContato = await resolverCliente(pedido, token);
        if (!idContato) throw new Error("Não foi possível identificar o cliente no Tiny.");

        await sleep(1000); 

        // 2. TRATAMENTO DOS ITENS (Aqui está a mágica misturada)
        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
        let somaProdutosBase = 0;

        console.log("🔍 MAPEANDO ITENS (USANDO BANCO DE DADOS)...");

        const itensFormatados = await Promise.all(listaItens.map(async (item) => {
            
            // A. Tenta pegar ID que veio do Front
            let idParaTiny = item.tinyId || item.id_tiny;
            const idLocal = item.id || item.produtoId;

            // B. SE NÃO VEIO ID DO TINY, BUSCA NO BANCO (Igual sua rota antiga)
            if (!idParaTiny && idLocal) {
                console.log(`   🔎 Buscando ID ${idLocal} no Prisma...`);
                try {
                    const prodDb = await prisma.produto.findUnique({ 
                        where: { id: parseInt(idLocal) } 
                    });
                    if (prodDb && prodDb.tinyId) {
                        idParaTiny = prodDb.tinyId;
                        console.log(`   ✅ Achou no banco! TinyID: ${idParaTiny}`);
                    }
                } catch (errDb) {
                    console.log("   ⚠️ Erro ao buscar no banco local:", errDb.message);
                }
            }

            const qtd = parseFloat(item.qtd || item.quantidade || 1);
            const unitario = parseFloat(item.preco || item.unitario || item.valor_unitario || 0);
            somaProdutosBase += (qtd * unitario);
            const valorFinalUnitario = unitario > 0 ? unitario : 0.01;

            // C. DECISÃO FINAL: ID OU CÓDIGO?
            let objetoProduto = {};
            
            if (idParaTiny) {
                // Se temos o ID do Tiny real, usamos ele
                objetoProduto = { id: parseInt(idParaTiny) };
            } else {
                // Se SÓ temos o ID local (ex: 55), enviamos como CÓDIGO (SKU)
                // Isso evita o erro "Produto não encontrado" ao buscar pelo ID interno
                console.log(`   ⚠️ Sem TinyID. Enviando ID Local ${idLocal} como CÓDIGO.`);
                objetoProduto = { 
                    codigo: String(item.referencia || idLocal),
                    descricao: item.nome || "Produto Site"
                };
            }

            return {
                produto: objetoProduto,
                quantidade: qtd,
                valorUnitario: valorFinalUnitario
            };
        }));

        // 3. Cálculos Financeiros
        const totalPago = parseFloat(pedido.valorTotal); 
        const frete = 0; 
        
        let valorOutrasDespesas = 0;
        let diferenca = totalPago - (somaProdutosBase + frete);
        // Margem de erro de 5 centavos para arredondamento
        if (diferenca > 0.05) {
            valorOutrasDespesas = parseFloat((diferenca).toFixed(2));
        }
        
        let valorDesconto = 0;
        if (diferenca < -0.05) {
            valorDesconto = parseFloat(Math.abs(diferenca).toFixed(2));
        }

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