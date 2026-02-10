const axios = require('axios');
const { getValidToken } = require('./tinyAuth'); 
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Função de espera (Paciência)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// =================================================================
// 🕵️ FUNÇÃO 1: RESOLVER CLIENTE (COMPLETA E ROBUSTA)
// =================================================================
async function resolverCliente(pedido, token) {
    const cpfLimpo = (pedido.clienteDoc || '').replace(/\D/g, '');
    const nome = pedido.clienteNome;

    // 1. Monta os dados com Endereço Completo
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

    // 2. Tenta Buscar por CPF
    if (cpfLimpo) {
        try {
            console.log(`🔎 Buscando cliente por CPF: ${cpfLimpo}`);
            const resBusca = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?cpf_cnpj=${cpfLimpo}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (resBusca.data.data && resBusca.data.data.length > 0) {
                idContato = resBusca.data.data[0].id;
                console.log(`✅ Cliente encontrado (ID: ${idContato}). Atualizando endereço...`);
                
                // Tenta Atualizar o Endereço (PUT)
                try {
                    await axios.put(`https://api.tiny.com.br/public-api/v3/contatos/${idContato}`, dadosCliente, { headers: { 'Authorization': `Bearer ${token}` } });
                } catch (e) { 
                    console.warn("⚠️ Falha leve ao atualizar endereço (PUT):", e.message);
                    if(e.response?.status === 429) await sleep(2000); 
                }
                return idContato;
            }
        } catch (e) {
            console.error("❌ Erro na busca por CPF:", e.message);
        }
    }

    // 3. Se não achou, Tenta Criar (POST)
    try {
        console.log("🆕 Criando novo cliente no Tiny...");
        const resCriar = await axios.post(`https://api.tiny.com.br/public-api/v3/contatos`, dadosCliente, { headers: { 'Authorization': `Bearer ${token}` } });
        
        const novoId = resCriar.data.data?.id || resCriar.data.id;
        console.log(`✨ Cliente criado com sucesso! ID: ${novoId}`);
        return novoId;

    } catch (error) {
        // Tratamento de Erro 429 (Bloqueio Temporário)
        if (error.response?.status === 429) {
            console.log("🛑 Tiny bloqueou (429). Esperando 4s para tentar de novo...");
            await sleep(4000);
            try {
                const resRetry = await axios.post(`https://api.tiny.com.br/public-api/v3/contatos`, dadosCliente, { headers: { 'Authorization': `Bearer ${token}` } });
                return resRetry.data.data?.id || resRetry.data.id;
            } catch (e) {
                console.error("❌ Falha na segunda tentativa de criação.");
            }
        }

        console.error("❌ Erro ao criar cliente:", JSON.stringify(error.response?.data || error.message));
        
        // 4. Última esperança: Buscar por Nome
        try {
            console.log("⚠️ Tentando buscar por nome como fallback...");
            const resBuscaNome = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?pesquisa=${encodeURIComponent(nome)}`, { headers: { 'Authorization': `Bearer ${token}` } });
            return resBuscaNome.data.data?.[0]?.id;
        } catch (e) { return null; }
    }
}

// =================================================================
// 🚀 FUNÇÃO 2: ENVIAR PEDIDO (IDS SINCRONIZADOS + FALLBACK CÓDIGO)
// =================================================================
async function enviarPedidoParaTiny(pedido) {
    try {
        console.log(`🤖 Service: Processando Pedido...`);
        const token = await getValidToken();

        // 1. Resolve Cliente
        const idContato = await resolverCliente(pedido, token);
        
        // Se falhar aqui, mostra o erro no terminal
        if (!idContato) {
            console.error("🚨 ERRO FATAL: Cliente não encontrado e não foi possível criar.");
            throw new Error("Erro no Cliente Tiny.");
        }

        await sleep(1000);

        // 2. Mapeia Itens
        const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
        let somaProdutosBase = 0;

        console.log("🔍 ITENS DO PEDIDO:");

        const itensFormatados = await Promise.all(listaItens.map(async (item) => {
            const qtd = parseFloat(item.qtd || item.quantidade || 1);
            const unitario = parseFloat(item.preco || item.unitario || 0);
            somaProdutosBase += (qtd * unitario);

            // Tenta usar o ID sincronizado
            const idReal = parseInt(item.id);

            // Lógica de Segurança:
            // Se você já sincronizou o banco, o ID local (ex: 849201) é igual ao do Tiny.
            // Se você NÃO sincronizou, o ID local é 55. Enviar ID: 55 quebra.
            // Então vamos checar: Se o ID for muito pequeno (< 100000), enviamos como CÓDIGO.
            
            let objetoProduto = {};

            if (idReal > 100000) {
                // É um ID do Tiny (grande)
                console.log(`   ✅ ID Tiny Válido (${idReal}). Enviando como ID.`);
                objetoProduto = { id: idReal };
            } else {
                // É um ID Local antigo (pequeno). Envia como Código.
                console.log(`   ⚠️ ID Local Antigo (${idReal}). Enviando como CÓDIGO (SKU).`);
                objetoProduto = { 
                    codigo: String(item.referencia || item.sku || idReal),
                    descricao: item.nome || "Produto"
                };
            }

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
                console.log("⏳ Tiny 429 no Pedido. Tentando de novo em 5s...");
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