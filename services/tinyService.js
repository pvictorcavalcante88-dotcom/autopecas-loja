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
            console.log(`🔎 Buscando cliente CPF: ${cpfLimpo}`);
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
        console.log("🆕 Criando novo cliente...");
        const resCriar = await axios.post(`https://api.tiny.com.br/public-api/v3/contatos`, dadosCliente, { headers: { 'Authorization': `Bearer ${token}` } });
        return resCriar.data.data?.id || resCriar.data.id;
    } catch (error) {
        if (error.response?.status === 429) {
            console.log("🛑 Tiny bloqueou (429). Esperando 4s...");
            await sleep(4000);
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
// 🚀 FUNÇÃO 2: ENVIAR PEDIDO (BLINDAGEM CONTRA "NaN")
// =================================================================
async function enviarPedidoParaTiny(pedido) {
    try {
        console.log(`🤖 Service: Processando Pedido...`);
        const token = await getValidToken();

        // 1. Resolve Cliente
        const idContato = await resolverCliente(pedido, token);
        if (!idContato) throw new Error("Erro no Cliente Tiny.");

        await sleep(1000);

        // 2. Mapeia Itens
        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
        let somaProdutosBase = 0;

        console.log("🔍 ITENS DO PEDIDO (DEPURAÇÃO):");

        const itensFormatados = await Promise.all(listaItens.map(async (item, index) => {
            
            // --- INÍCIO DA BLINDAGEM ---
            
            // Log para ver o que diabos está chegando
            console.log(`   🔸 Item [${index}] Raw:`, JSON.stringify(item));

            const qtd = parseFloat(item.qtd || item.quantidade || 1);
            const unitario = parseFloat(item.preco || item.unitario || item.valor_unitario || 0);
            somaProdutosBase += (qtd * unitario);

            // Tenta achar o ID em qualquer buraco possível
            const rawId = item.id || item.produtoId || item.tinyId || item.id_tiny || item.id_produto;
            
            // Converte para número e trata o NaN
            let idNumerico = parseInt(rawId);
            if (isNaN(idNumerico)) idNumerico = 0;

            console.log(`   🔹 ID Extraído: ${idNumerico} (Veio de: ${rawId})`);

            let objetoProduto = {};

            // Lógica de Decisão: ID vs CÓDIGO
            // Se for um número grande (> 100.000), confiamos que é um ID do Tiny
            if (idNumerico > 100000) {
                console.log(`   ✅ Enviando por ID: ${idNumerico}`);
                objetoProduto = { id: idNumerico };
            } else {
                // Se for pequeno (ex: 55) ou Zero, enviamos por CÓDIGO/SKU
                // Importante: Se o ID for 0 ou inválido, usamos um SKU de segurança
                const codigoFinal = String(item.referencia || item.sku || (idNumerico > 0 ? idNumerico : "ITEM-SEM-ID"));
                
                console.log(`   ⚠️ Enviando por CÓDIGO: ${codigoFinal}`);
                
                objetoProduto = { 
                    codigo: codigoFinal,
                    descricao: item.nome || "Produto Site"
                };
            }
            // --- FIM DA BLINDAGEM ---

            return {
                produto: objetoProduto,
                quantidade: qtd,
                valorUnitario: unitario > 0 ? unitario : 0.01
            };
        }));

        // 3. Cálculos
        const totalPago = parseFloat(pedido.valorTotal); 
        const diferenca = parseFloat((totalPago - somaProdutosBase).toFixed(2));
        const valorOutrasDespesas = diferenca > 0.05 ? diferenca : 0;
        const valorDesconto = diferenca < -0.05 ? Math.abs(diferenca) : 0;

        const payload = {
            data: new Date().toISOString().split('T')[0],
            idContato: idContato,
            itens: itensFormatados,
            naturezaOperacao: { id: 335900648 },
            valorFrete: 0,
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

        // Envio com Retry
        let response;
        try {
            response = await axios.post(`https://api.tiny.com.br/public-api/v3/pedidos`, payload, { headers: { 'Authorization': `Bearer ${token}` } });
        } catch (erroEnvio) {
            if (erroEnvio.response?.status === 429) {
                console.log("⏳ Tiny 429 (Pedido). Tentando de novo em 5s...");
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