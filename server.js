const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const path = require('path'); // <--- 1. IMPORTANTE: Importar o Path
const multer = require('multer');
const fs = require('fs');

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

// =================================================================
// 🌐 SERVIR O SITE (FRONTEND) - A PARTE QUE FALTOU
// =================================================================
// Isso diz ao servidor: "Se alguém pedir index.html, css ou js, entregue!"
app.use(express.static(path.join(__dirname, '.'))); 
app.use('/uploads', express.static('uploads'));

const SECRET_KEY = "SEGREDO_SUPER_SECRETO"; 

// =================================================================
// 🛡️ MIDDLEWARE DE SEGURANÇA
// =================================================================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}


// Garante que a pasta uploads existe
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Configuração do Carteiro (Onde salvar e qual nome dar)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/') 
    },
    filename: function (req, file, cb) {
        // Salva com data para não repetir nome (ex: 171500-comprovante.pdf)
        cb(null, Date.now() + path.extname(file.originalname)) 
    }
});

const upload = multer({ storage: storage });

// =================================================================
// 🔑 ROTA DE LOGIN ADMIN (ATUALIZADA)
// =================================================================
app.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    
    // Debug: Vai mostrar no terminal o que você digitou (ajuda a achar erro de digitação)
    console.log("Tentativa de Login Admin recebida:", email, " | Senha:", senha);

    // OPÇÃO 1: Credenciais Padrão
    if (email === "admin@autopecas.com" && senha === "admin123") {
        const token = jwt.sign({ role: 'admin' }, SECRET_KEY, { expiresIn: '12h' });
        return res.json({ token });
    }

    // OPÇÃO 2: Credencial de Emergência (TESTE ESSA!)
    if (email === "admin" && senha === "admin") {
        const token = jwt.sign({ role: 'admin' }, SECRET_KEY, { expiresIn: '12h' });
        return res.json({ token });
    }

    res.status(401).json({ erro: "Credenciais inválidas" });
});

app.post('/afiliado/login', async (req, res) => {
    const { telefone, senha } = req.body;
    try {
        const afiliado = await prisma.afiliado.findUnique({ where: { telefone } });
        if (!afiliado) return res.status(404).json({ erro: "Afiliado não encontrado" });
        
        if (afiliado.senha !== senha) return res.status(401).json({ erro: "Senha incorreta" });
        if (!afiliado.aprovado) return res.status(403).json({ erro: "Cadastro pendente" });

        const token = jwt.sign({ id: afiliado.id, role: 'afiliado' }, SECRET_KEY, { expiresIn: '30d' });
        
        res.json({ 
            token, 
            nome: afiliado.nome, 
            codigo: afiliado.codigo,
            margem: afiliado.margem 
        });
    } catch (error) {
        res.status(500).json({ erro: "Erro no servidor" });
    }
});

// ROTA DE BUSCA INTELIGENTE (Corrigida e Melhorada)
app.get('/search', async (req, res) => {
    try {
        const { q, categoria } = req.query;
        let whereClause = {};
        let condicoesAnd = [];

        if (categoria) condicoesAnd.push({ categoria: { contains: categoria } });

        if (q) {
            const termos = q.trim().split(/\s+/);
            termos.forEach(termo => {
                condicoesAnd.push({
                    OR: [
                        { titulo: { contains: termo } },
                        { referencia: { contains: termo } },
                        { carros: { contains: termo } },
                        { pesquisa: { contains: termo } },
                        { fabricante: { contains: termo } },
                        { categoria: { contains: termo } },
                        { tags: { contains: termo } } // <--- ADICIONE SÓ ESSA LINHA AQUI!
                    ]
                });
            });
        }

        if (condicoesAnd.length > 0) whereClause.AND = condicoesAnd;

        const produtos = await prisma.produto.findMany({
            where: whereClause,
            take: 50
        });
        res.json(produtos);
    } catch (error) { res.json([]); }
});

// =================================================================
// 📂 ROTAS DE ORÇAMENTOS
// =================================================================
app.post('/orcamentos', authenticateToken, async (req, res) => {
    try {
        const { nome, itens, total } = req.body;
        const afiliadoId = req.user.id; 

        const novo = await prisma.orcamento.create({
            data: { nome, itens: JSON.stringify(itens), total: parseFloat(total), afiliadoId }
        });
        res.json({ mensagem: "Salvo!", id: novo.id });
    } catch (e) { res.status(500).json({ erro: "Erro ao salvar." }); }
});

app.get('/afiliado/orcamentos', authenticateToken, async (req, res) => {
    try {
        const orcamentos = await prisma.orcamento.findMany({
            where: { afiliadoId: req.user.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json(orcamentos);
    } catch (e) { res.status(500).json({ erro: "Erro ao buscar." }); }
});

app.delete('/orcamentos/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.orcamento.deleteMany({ where: { id: parseInt(req.params.id), afiliadoId: req.user.id } });
        res.json({ mensagem: "Deletado" });
    } catch (e) { res.status(500).json({ erro: "Erro ao deletar." }); }
});

// ROTA: DETALHES DO PRODUTO + RELACIONADOS
app.get('/products/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ erro: "ID inválido" });

        // 1. Busca o produto principal
        const produto = await prisma.produto.findUnique({ where: { id: id } });
        if (!produto) return res.status(404).json({ erro: "Produto não encontrado" });

        // 2. Busca os Relacionados (A Mágica acontece aqui)
        let listaRelacionados = [];
        
        // O campo 'produtos_relacionados' existe no seu schema como String?, então verificamos se ele tem conteúdo
        if (produto.produtos_relacionados) {
            // Transforma "12, 15, 20" em uma lista de números [12, 15, 20]
            const ids = produto.produtos_relacionados.split(',')
                .map(num => parseInt(num.trim()))
                .filter(n => !isNaN(n)); // Remove erros caso tenha virgula sobrando ou espaços

            if (ids.length > 0) {
                listaRelacionados = await prisma.produto.findMany({
                    where: { id: { in: ids } }, // Busca todos que tenham esses IDs
                    // AQUI ESTÁ O SEGREDO: Usamos os nomes do SEU schema (titulo, preco_novo, imagem)
                    select: { id: true, titulo: true, imagem: true, preco_novo: true, categoria: true } 
                });
            }
        }

        // 3. Envia tudo junto: Produto + Lista de Relacionados
        res.json({ ...produto, listaRelacionados });

    } catch (e) {
        console.error("Erro ao buscar produto:", e);
        res.status(500).json({ erro: "Erro no servidor" });
    }
});

app.post('/admin/produtos', authenticateToken, async (req, res) => {
    if(req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const p = await prisma.produto.create({ data: req.body });
        res.json(p);
    } catch(e) { res.status(500).json({erro: e.message}); }
});

app.put('/admin/produtos/:id', authenticateToken, async (req, res) => {
    if(req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const p = await prisma.produto.update({ where: { id: parseInt(req.params.id) }, data: req.body });
        res.json(p);
    } catch(e) { res.status(500).json({erro: e.message}); }
});

app.delete('/admin/produtos/:id', authenticateToken, async (req, res) => {
    if(req.user.role !== 'admin') return res.sendStatus(403);
    try {
        await prisma.produto.delete({ where: { id: parseInt(req.params.id) } });
        res.json({success: true});
    } catch(e) { res.status(500).json({erro: e.message}); }
});

app.put('/afiliado/config', authenticateToken, async (req, res) => {
    try {
        await prisma.afiliado.update({
            where: { id: req.user.id },
            data: { margem: parseFloat(req.body.novaMargem) }
        });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ erro: "Erro" }); }
});

app.get('/afiliado/check/:codigo', async (req, res) => {
    try {
        const afiliado = await prisma.afiliado.findUnique({ where: { codigo: req.params.codigo } });
        if (afiliado) res.json({ margem: afiliado.margem });
        else res.status(404).json({ erro: "Não encontrado" });
    } catch(e) { res.status(500).json({ erro: "Erro" }); }
});

app.get('/afiliado/dashboard', authenticateToken, async (req, res) => {
    try {
        const afiliado = await prisma.afiliado.findUnique({
            where: { id: req.user.id },
            include: { pedidos: true }
        });
        res.json(afiliado);
    } catch (e) { res.status(500).json({ erro: "Erro" }); }
});

// ROTA: FINALIZAR PEDIDO (SALVANDO IDs PARA O ESTOQUE)
app.post('/finalizar-pedido', async (req, res) => {
    try {
        const { cliente, itens, afiliadoCodigo } = req.body;
        
        let valorTotal = 0;
        let comissaoReal = 0;
        
        // Vamos criar uma lista estruturada para salvar no banco (com IDs!)
        let itensParaBanco = [];
        let itensTextoZap = ""; // Texto apenas para o aviso do WhatsApp

        for (const i of itens) {
            valorTotal += (i.unitario * i.qtd);
            itensTextoZap += `${i.qtd}x ${i.nome} | `;

            // Guarda os dados técnicos na lista
            itensParaBanco.push({
                id: parseInt(i.id), // Importante: Salva o ID!
                nome: i.nome,
                qtd: parseInt(i.qtd),
                unitario: i.unitario
            });

            // Cálculo da Comissão
            if (afiliadoCodigo) {
                const idProd = parseInt(i.id);
                const produtoOriginal = await prisma.produto.findUnique({ where: { id: idProd } });
                if (produtoOriginal) {
                    const precoCusto = parseFloat(produtoOriginal.preco_novo);
                    const precoVenda = parseFloat(i.unitario);
                    const lucroItem = (precoVenda - precoCusto) * i.qtd;
                    if (lucroItem > 0) comissaoReal += lucroItem;
                }
            }
        }

        let dadosPedido = {
            clienteNome: cliente.nome,
            clienteEmail: cliente.email,
            clienteEndereco: cliente.endereco,
            valorTotal: valorTotal,
            // AQUI MUDOU: Salvamos como JSON String para manter os IDs
            itens: JSON.stringify(itensParaBanco), 
            comissaoGerada: 0.0,
            status: "PENDENTE"
        };

        if (afiliadoCodigo) {
            const afiliado = await prisma.afiliado.findUnique({ where: { codigo: afiliadoCodigo } });
            if (afiliado) {
                dadosPedido.afiliadoId = afiliado.id;
                dadosPedido.comissaoGerada = comissaoReal;
            }
        }

        const pedido = await prisma.pedido.create({ data: dadosPedido });

        // --- ROBÔ DO ZAP (CallMeBot) ---
        try {
            const SEU_TELEFONE = "558287515891"; // <--- SEU NÚMERO
            const API_KEY = "6414164";             // <--- SUA API KEY
            
            const msg = `🔔 *Nova Venda!* (#${pedido.id})\n` +
                        `💰 R$ ${valorTotal.toFixed(2)}\n` +
                        `📦 ${itensTextoZap}`; // Usa o texto simples aqui

            const urlBot = `https://api.callmebot.com/whatsapp.php?phone=${SEU_TELEFONE}&text=${encodeURIComponent(msg)}&apikey=${API_KEY}`;
            fetch(urlBot).catch(e => console.error("Erro Zap", e));
        } catch (e) {}
        // -------------------------------

        res.json(pedido);

    } catch (error) { 
        console.error("ERRO AO FINALIZAR:", error);
        res.status(500).json({ erro: "Erro ao processar pedido" }); 
    }
});

// =========================================================
// 🔔 SISTEMA DE NOTIFICAÇÕES DO AFILIADO
// =========================================================

// 1. Buscar Notificações (Vendas novas e Mensagens não lidas)
app.get('/afiliado/notificacoes', authenticateToken, async (req, res) => {
    try {
        const id = req.user.id;
        
        // Busca mensagens não lidas
        const mensagens = await prisma.mensagem.findMany({
            where: { afiliadoId: id, lida: false },
            orderBy: { createdAt: 'desc' }
        });

        // Busca vendas que ele ainda não viu
        const vendas = await prisma.pedido.findMany({
            where: { afiliadoId: id, notificado_afiliado: false },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ mensagens, vendas });
    } catch (e) { res.status(500).json({ mensagens: [], vendas: [] }); }
});

// 2. Marcar como Lidas (Limpar o sininho)
app.post('/afiliado/notificacoes/ler', authenticateToken, async (req, res) => {
    try {
        const id = req.user.id;
        // Marca mensagens como lidas
        await prisma.mensagem.updateMany({
            where: { afiliadoId: id, lida: false },
            data: { lida: true }
        });
        // Marca vendas como vistas
        await prisma.pedido.updateMany({
            where: { afiliadoId: id, notificado_afiliado: false },
            data: { notificado_afiliado: true }
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erro ao limpar notificações" }); }
});

// ATUALIZAR DADOS BANCÁRIOS / PERFIL
app.put('/afiliado/perfil', authenticateToken, async (req, res) => {
    try {
        const { chavePix, banco, agencia, conta } = req.body;
        await prisma.afiliado.update({
            where: { id: req.user.id },
            data: { chavePix, banco, agencia, conta }
        });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ erro: "Erro ao atualizar perfil" }); }
});

// LER MENSAGENS DO ADMIN
app.get('/afiliado/mensagens', authenticateToken, async (req, res) => {
    try {
        const msgs = await prisma.mensagem.findMany({
            where: { afiliadoId: req.user.id },
            orderBy: { createdAt: 'desc' },
            take: 10
        });
        res.json(msgs);
    } catch(e) { res.status(500).json({ erro: "Erro ao buscar mensagens" }); }
});

// NOVA ROTA: ENVIAR MENSAGEM COM ARQUIVO
// Note o 'upload.single' ali no meio
app.post('/admin/mensagens', authenticateToken, upload.single('arquivo'), async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const { afiliadoId, texto } = req.body;
        const arquivoPath = req.file ? req.file.path : null; // Pega o caminho se tiver arquivo

        await prisma.mensagem.create({
            data: {
                texto: texto || "", // Texto pode ser vazio se tiver anexo
                arquivo: arquivoPath,
                afiliadoId: parseInt(afiliadoId)
            }
        });

        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ erro: "Erro ao enviar mensagem." });
    }
});

// =================================================================
// 👑 ROTAS DO PAINEL ADMIN (DADOS)
// =================================================================

// ROTA DASHBOARD BLINDADA (Substitua a antiga no server.js)
app.get('/admin/dashboard-stats', authenticateToken, async (req, res) => {
    // 1. Verifica Permissão
    if (!req.user || req.user.role !== 'admin') return res.sendStatus(403);

    try {
        console.log("📊 Buscando dados do Dashboard..."); // Log para sabermos que começou

        // Buscas individuais (Se uma falhar, sabemos qual foi)
        const totalPedidos = await prisma.pedido.count();
        console.log("- Pedidos OK:", totalPedidos);

        const produtos = await prisma.produto.count();
        console.log("- Produtos OK:", produtos);
        
        // Cuidado aqui: Se 'valorTotal' não existir, vai dar erro
        const somaVendas = await prisma.pedido.aggregate({ _sum: { valorTotal: true } });
        console.log("- Soma Vendas OK");

        // Cuidado aqui: Se 'quantidade' não for número, pode dar erro
        let estoqueBaixo = 0;
        try {
            estoqueBaixo = await prisma.produto.count({ where: { estoque: { lte: 5 } } });
        } catch (err) {
            console.log("⚠️ Aviso: Erro ao contar estoque baixo (Campo 'estoque' existe?)");
        }
        console.log("- Estoque Baixo OK");

        const ultimosPedidos = await prisma.pedido.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
        console.log("- Últimos Pedidos OK");

        res.json({
            faturamento: somaVendas._sum.valorTotal || 0,
            totalPedidos,
            produtos,
            estoqueBaixo,
            ultimosPedidos
        });

    } catch (e) { 
        console.error("❌ ERRO CRÍTICO NO DASHBOARD:", e); // Isso vai mostrar o erro real no terminal
        res.status(500).json({ erro: "Erro interno no servidor: " + e.message }); 
    }
});


// ROTA: MUDAR STATUS (COM BAIXA DE ESTOQUE E COMISSÃO)
app.put('/admin/orders/:id/status', authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status } = req.body;

        // 1. Busca o pedido antigo
        const pedidoAntigo = await prisma.pedido.findUnique({ 
            where: { id: id },
            include: { afiliado: true }
        });

        if (!pedidoAntigo) return res.status(404).json({ erro: "Pedido não encontrado" });

        console.log(`Atualizando Pedido #${id} para ${status}...`);

        // =========================================================
        // AÇÃO 1: BAIXA NO ESTOQUE (Só se virar APROVADO)
        // =========================================================
        if (status === 'APROVADO' && pedidoAntigo.status !== 'APROVADO') {
            try {
                // Converte o texto JSON de volta para Lista de Objetos
                const listaItens = JSON.parse(pedidoAntigo.itens);
                
                // Se for uma lista válida, percorre e desconta
                if (Array.isArray(listaItens)) {
                    for (const item of listaItens) {
                        // Desconta do estoque no banco
                        await prisma.produto.update({
                            where: { id: item.id },
                            data: { estoque: { decrement: item.qtd } }
                        });
                        console.log(`📉 Baixa de estoque: -${item.qtd} no Produto ID ${item.id}`);
                    }
                }
            } catch (err) {
                console.log("⚠️ Aviso: Não foi possível baixar estoque (talvez seja um pedido antigo salvo como texto).");
            }
        }

        // =========================================================
        // AÇÃO 2: LIBERAR COMISSÃO (Só se virar APROVADO)
        // =========================================================
        if (status === 'APROVADO' && pedidoAntigo.status !== 'APROVADO') {
            if (pedidoAntigo.afiliadoId && pedidoAntigo.comissaoGerada > 0) {
                await prisma.afiliado.update({
                    where: { id: pedidoAntigo.afiliadoId },
                    data: { saldo: { increment: pedidoAntigo.comissaoGerada } }
                });
                console.log("💰 Comissão liberada!");
            }
        }

        // =========================================================
        // AÇÃO 3: ESTORNAR TUDO (Se cancelar depois de aprovado)
        // =========================================================
        if (status === 'CANCELADO' && pedidoAntigo.status === 'APROVADO') {
            // Estorna Comissão
            if (pedidoAntigo.afiliadoId && pedidoAntigo.comissaoGerada > 0) {
                await prisma.afiliado.update({
                    where: { id: pedidoAntigo.afiliadoId },
                    data: { saldo: { decrement: pedidoAntigo.comissaoGerada } }
                });
            }
            // Devolve Estoque
            try {
                const listaItens = JSON.parse(pedidoAntigo.itens);
                if (Array.isArray(listaItens)) {
                    for (const item of listaItens) {
                        await prisma.produto.update({
                            where: { id: item.id },
                            data: { estoque: { increment: item.qtd } } // Devolve (+)
                        });
                    }
                }
            } catch(e) {}
        }

        // 3. Salva o novo status
        const pedidoAtualizado = await prisma.pedido.update({
            where: { id: id },
            data: { status: status }
        });

        res.json(pedidoAtualizado);

    } catch (e) {
        console.error("ERRO AO MUDAR STATUS:", e);
        res.status(500).json({ erro: e.message });
    }
});

// ============================================================
// ROTA: BUSCAR CLIENTES DO AFILIADO (Baseado nas vendas)
// ============================================================
app.get('/afiliado/meus-clientes', authenticateToken, async (req, res) => {
    try {
        // Pega o ID do afiliado logado (assumindo que o token guardou o ID do afiliado)
        // Se o seu token de afiliado for diferente do admin, ajuste aqui.
        // Vamos buscar pelo código do afiliado se o token tiver o código, ou ID.
        
        // Buscando afiliado pelo token (Exemplo)
        const afiliadoId = req.user.id; 

        // Busca todas as vendas desse afiliado
        const vendas = await prisma.pedido.findMany({
            where: { afiliadoId: afiliadoId },
            orderBy: { createdAt: 'desc' }
        });

        // Agrupa clientes por email para não repetir
        const clientesMap = new Map();

        vendas.forEach(venda => {
            if (!clientesMap.has(venda.clienteEmail)) {
                clientesMap.set(venda.clienteEmail, {
                    nome: venda.clienteNome,
                    email: venda.clienteEmail,
                    telefone: venda.clienteTelefone || "Não informado", // Se tiver salvo
                    totalGasto: 0,
                    ultimaCompra: venda.createdAt,
                    pedidos: []
                });
            }
            
            const cliente = clientesMap.get(venda.clienteEmail);
            cliente.totalGasto += venda.valorTotal;
            cliente.pedidos.push({
                id: venda.id,
                data: venda.createdAt,
                valor: venda.valorTotal,
                status: venda.status
            });
        });

        // Converte o mapa em lista
        const listaClientes = Array.from(clientesMap.values());

        res.json(listaClientes);

    } catch (e) {
        console.error(e);
        res.status(500).json({ erro: "Erro ao buscar clientes" });
    }
});

// ROTA WEBHOOK (Para receber avisos do Mercado Pago/Gateway)
app.post('/webhook/pagamento', async (req, res) => {
    try {
        const dados = req.body;
        console.log("Notificação recebida:", dados);

        // Lógica Fictícia (Varia conforme a operadora)
        // Se a operadora disser "status: approved" e mandar o "external_reference: 14"
        
        /* const idPedido = dados.external_reference;
        const statusPagamento = dados.status; // ex: 'approved'

        if (statusPagamento === 'approved') {
            await prisma.pedido.update({
                where: { id: Number(idPedido) },
                data: { status: 'APROVADO' }
            });
        }
        */

        res.status(200).send("OK"); // Avisa o Gateway que recebeu
    } catch (e) {
        console.error(e);
        res.status(500).send("Erro");
    }
});

// ROTA: MUDAR STATUS (Versão Fofoqueira / Debug)
app.put('/admin/orders/:id/status', authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status } = req.body;

        // Se o ID não for número, já avisa
        if (isNaN(id)) throw new Error(`O ID recebido (${req.params.id}) não é um número válido.`);

        console.log(`Tentando atualizar Pedido #${id} para '${status}'`);

        const pedido = await prisma.pedido.update({
            where: { id: id },
            data: { status: status }
        });

        res.json(pedido);

    } catch (e) {
        console.error("ERRO REAL:", e);
        // AQUI ESTÁ O SEGREDO: Enviamos o erro técnico para o Front
        res.status(500).json({ 
            erro: "Falha ao salvar", 
            motivo: e.message, // Vai dizer o que o Prisma reclamou
            tipo: e.code // Código do erro (ex: P2025)
        });
    }
});

// 2. LISTA DE PEDIDOS COMPLETA
app.get('/admin/pedidos', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const pedidos = await prisma.pedido.findMany({
            orderBy: { createdAt: 'desc' },
            include: { afiliado: true } // Inclui dados do vendedor se tiver
        });
        res.json(pedidos);
    } catch (e) { res.status(500).json({ erro: "Erro ao buscar pedidos" }); }
});

// 3. LISTA DE AFILIADOS COMPLETA
app.get('/admin/afiliados', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        // Busca afiliados e também soma quanto eles já venderam
        const afiliados = await prisma.afiliado.findMany({
            include: { pedidos: true } 
        });

        // Formata para enviar pro front
        const resposta = afiliados.map(af => ({
            id: af.id,
            nome: af.nome,
            telefone: af.telefone,
            codigo: af.codigo,
            saldo: af.saldo,
            aprovado: af.aprovado,
            chavePix: af.chavePix,
            banco: af.banco,
            agencia: af.agencia,
            conta: af.conta,
            vendasTotais: af.pedidos.reduce((acc, p) => acc + p.valorTotal, 0)
        }));

        res.json(resposta);
    } catch (e) { res.status(500).json({ erro: "Erro ao buscar afiliados" }); }
});

// 4. APROVAR/BLOQUEAR AFILIADO
app.put('/admin/afiliados/:id/status', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const { aprovado } = req.body;
        await prisma.afiliado.update({
            where: { id: parseInt(req.params.id) },
            data: { aprovado }
        });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ erro: "Erro ao atualizar status" }); }
});

// 5. ENVIAR MENSAGEM (Já tínhamos feito, mas garanta que está lá)
app.post('/admin/mensagens', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const { afiliadoId, texto } = req.body;
        await prisma.mensagem.create({
            data: { texto, afiliadoId: parseInt(afiliadoId) }
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ erro: "Erro ao enviar mensagem." }); }
});

// =========================================================
// 🧠 ROTAS DE INTELIGÊNCIA (SUGESTÕES)
// =========================================================

// 1. AFILIADO ENVIA SUGESTÃO
app.post('/afiliado/sugestoes', authenticateToken, async (req, res) => {
    try {
        const { produtoId, termo, motivo } = req.body;
        await prisma.sugestao.create({
            data: {
                termo,
                motivo,
                produtoId: parseInt(produtoId),
                afiliadoId: req.user.id
            }
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ erro: "Erro ao salvar sugestão." }); }
});

// 2. ADMIN LISTA SUGESTÕES
app.get('/admin/sugestoes', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const lista = await prisma.sugestao.findMany({
        where: { status: 'PENDENTE' },
        include: { produto: true, afiliado: true }
    });
    res.json(lista);
});

// 3. ADMIN APROVA (Adiciona nas TAGS do produto)
app.post('/admin/sugestoes/:id/aprovar', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const sugestao = await prisma.sugestao.findUnique({ where: { id: parseInt(req.params.id) }, include: { produto: true } });
        
        // Pega as tags atuais e adiciona a nova
        const tagsAtuais = sugestao.produto.tags || ""; 
        const novasTags = tagsAtuais + " " + sugestao.termo; 
        
        await prisma.produto.update({
            where: { id: sugestao.produtoId },
            data: { tags: novasTags }
        });

        await prisma.sugestao.update({ where: { id: sugestao.id }, data: { status: 'APROVADO' } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ erro: "Erro ao aprovar." }); }
});

// 4. ADMIN REJEITA
app.post('/admin/sugestoes/:id/rejeitar', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await prisma.sugestao.update({ where: { id: parseInt(req.params.id) }, data: { status: 'REJEITADO' } });
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});