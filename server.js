require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const qs = require('querystring');
const axios = require('axios');
const { getValidToken } = require('./services/tinyAuth');
const { enviarPedidoParaTiny } = require('./services/tinyService');
const path = require('path'); 
const multer = require('multer');
const fs = require('fs');
const app = express();


// ==============================================================
// 1. CONFIGURAÇÃO DOS ENDEREÇOS PERMITIDOS (CORS)
// ==============================================================
const allowedOrigins = [
    'https://autopecas-loja.onrender.com',        // Seu Backend
    'https://nimble-bublanina-1395f3.netlify.app', // 🟢 SEU ADMIN (NETLIFY)
    'http://127.0.0.1:5500',                      // Teste Local (VS Code)
    'http://localhost:3000'                       // Teste Local (React/Node)
];

app.use(cors({
    origin: function (origin, callback) {
        // PERMITE SE:
        // 1. Não tiver origem (acesso direto via Postman ou servidor-servidor)
        // 2. A origem for "null" (alguns navegadores fazem isso em redirecionamentos)
        // 3. A origem estiver na lista allowedOrigins
        if (!origin || origin === 'null' || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log("🚫 CORS Bloqueou a origem:", origin); // Log para você ver quem foi barrado
            callback(new Error('Bloqueado pelo CORS: Origem não permitida.'));
        }
    },
    credentials: true // Importante para cookies/login funcionarem
}));

// ... resto do código (rotas, app.listen, etc) ...

// ==============================================================
// 📊 CONFIGURAÇÃO DE TAXAS E IMPOSTOS (ATUALIZADO)
// ==============================================================
const CONFIG_FINANCEIRA = {
    impostoGoverno: 0.06,        // 6% (Simples Nacional)
    taxaAsaasPix: 0.99,          // R$ 0,99 fixo por Pix
    taxaAsaasCartaoPct: 0.055,   // 5.5% (Cobre Crédito + Antecipação)
    taxaAsaasCartaoFixo: 0.49    // R$ 0,49 fixo por transação
};

const { criarCobrancaPixDireto, criarLinkPagamento } = require('./services/asaasService');

const prisma = new PrismaClient();
app.use(express.json());

// =================================================================
// 🌐 SERVIR O SITE (FRONTEND)
// =================================================================
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

// Configuração de Uploads
if (!fs.existsSync('uploads')) { fs.mkdirSync('uploads'); }

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, 'uploads/') },
    filename: function (req, file, cb) { cb(null, Date.now() + path.extname(file.originalname)) }
});
const upload = multer({ storage: storage });

// =================================================================
// 🔑 ROTAS DE LOGIN
// =================================================================
app.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        // Busca o admin no banco PostgreSQL que aparece no seu print
        const admin = await prisma.admin.findUnique({ where: { email } });

        if (!admin) {
            return res.status(401).json({ erro: "Credenciais inválidas" });
        }

        // Se estiver usando senhas seguras (recomendado):
        const senhaValida = await bcrypt.compare(senha, admin.senha);
        
        // Se ainda estiver testando com senha em texto puro:
        // const senhaValida = (senha === admin.senha);

        if (senhaValida) {
            const token = jwt.sign({ id: admin.id, role: 'admin' }, SECRET_KEY, { expiresIn: '12h' });
            return res.json({ token });
        }
        res.status(401).json({ erro: "Credenciais inválidas" });
    } catch (e) {
        console.error(e);
        res.status(500).json({ erro: "Erro interno no servidor" }); // É aqui que gera o erro do seu print
    }
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
            margem: afiliado.margem,
            telefone: afiliado.telefone
        });
    } catch (error) { res.status(500).json({ erro: "Erro no servidor" }); }
});

// ============================================================
// 📝 ROTA: CADASTRO DE NOVO AFILIADO
// ============================================================
app.post('/afiliado/cadastro', async (req, res) => {
    try {
        const { nome, telefone, codigo, senha, chavePix } = req.body;

        // 1. Validações Básicas
        if (!nome || !telefone || !codigo || !senha) {
            return res.status(400).json({ erro: "Preencha os campos obrigatórios." });
        }

        // 2. Verifica se já existe esse telefone
        const existeTel = await prisma.afiliado.findUnique({ where: { telefone } });
        if (existeTel) return res.status(400).json({ erro: "Este telefone já está cadastrado." });

        // 3. Verifica se já existe esse código
        const existeCod = await prisma.afiliado.findUnique({ where: { codigo } });
        if (existeCod) return res.status(400).json({ erro: "Este código já está em uso. Escolha outro." });

        // 4. Cria o Afiliado (aprovado = false para você aprovar depois)
        await prisma.afiliado.create({
            data: {
                nome,
                telefone,
                codigo,
                senha,
                chavePix,
                aprovado: false, // <--- IMPORTANTE: Entra como pendente
                saldo: 0.0,
                margem: 0.0
            }
        });

        res.json({ success: true, mensagem: "Cadastro realizado! Aguarde aprovação." });

    } catch (e) {
        console.error("Erro Cadastro:", e);
        res.status(500).json({ erro: "Erro ao criar conta. Tente novamente." });
    }
});

// =================================================================
// 🔍 BUSCA DE PRODUTOS
// =================================================================
app.get('/search', async (req, res) => {
    try {
        const { q, categoria } = req.query;
        let whereClause = {};
        let condicoesAnd = [];

        if (categoria) {
            condicoesAnd.push({ 
                categoria: { contains: categoria, mode: 'insensitive' } 
            });
        }

        if (q) {
            const termos = q.trim().split(/\s+/);
            termos.forEach(termo => {
                condicoesAnd.push({
                    OR: [
                        { titulo: { contains: termo, mode: 'insensitive' } },
                        { referencia: { contains: termo, mode: 'insensitive' } },
                        { carros: { contains: termo, mode: 'insensitive' } },
                        { pesquisa: { contains: termo, mode: 'insensitive' } },
                        { fabricante: { contains: termo, mode: 'insensitive' } },
                        { categoria: { contains: termo, mode: 'insensitive' } },
                        { tags: { contains: termo, mode: 'insensitive' } }
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
    } catch (error) { 
        console.error("Erro busca:", error);
        res.json([]); 
    }
});

app.get('/products/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ erro: "ID inválido" });

        const produto = await prisma.produto.findUnique({ where: { id: id } });
        if (!produto) return res.status(404).json({ erro: "Produto não encontrado" });

        let listaRelacionados = [];
        if (produto.produtos_relacionados) {
            const ids = produto.produtos_relacionados.split(',')
                .map(num => parseInt(num.trim()))
                .filter(n => !isNaN(n));

            if (ids.length > 0) {
                listaRelacionados = await prisma.produto.findMany({
                    where: { id: { in: ids } },
                    select: { id: true, titulo: true, imagem: true, preco_novo: true, categoria: true } 
                });
            }
        }
        res.json({ ...produto, listaRelacionados });
    } catch (e) { res.status(500).json({ erro: "Erro no servidor" }); }
});

// =================================================================
// 🦊 ÁREA DO AFILIADO (ROTAS CORRIGIDAS)
// =================================================================

// 1. DASHBOARD COMPLETO (Corrigi o nome para mandar 'vendas')
app.get('/afiliado/dashboard', authenticateToken, async (req, res) => {
    try {
        const id = req.user.id; 
        const afiliado = await prisma.afiliado.findUnique({
            where: { id: id },
            include: {
                pedidos: { 
                    orderBy: { createdAt: 'desc' },
                    take: 50 
                }
            }
        });

        if (!afiliado) return res.status(404).json({ erro: "Afiliado não encontrado" });

        res.json({
            // Dados Básicos
            nome: afiliado.nome,
            codigo: afiliado.codigo, 
            saldo: afiliado.saldo,
            
            // Dados Bancários
            chavePix: afiliado.chavePix,
            banco: afiliado.banco,
            agencia: afiliado.agencia,
            conta: afiliado.conta,
            
            // 🟢 O QUE ESTAVA FALTANDO (ADICIONE ISSO):
            cpf: afiliado.cpf,
            endereco: afiliado.endereco,
            telefone: afiliado.telefone, 
            email: afiliado.email, // Se tiver email no banco
            
            // Vendas
            vendas: afiliado.pedidos 
        });

    } catch (e) {
        console.error("Erro Dashboard:", e);
        res.status(500).json({ erro: "Erro ao buscar dados" });
    }
});
// ============================================================
// ROTA CORRIGIDA PARA SALVAR ORÇAMENTOS
// ============================================================

// 1. O nome da rota TEM que ser '/afiliado/orcamentos' para bater com o script.js
app.post('/afiliado/orcamentos', authenticateToken, async (req, res) => {
    try {
        // 2. Adicionei 'clienteDoc' aqui para receber o CPF vindo do site
        const { nome, itens, total, clienteDoc } = req.body;
        const afiliadoId = req.user.id; 

        // Verificação de segurança para o JSON
        // Se 'itens' já vier como texto do localStorage, usamos direto. Se vier como objeto, transformamos.
        const itensString = typeof itens === 'string' ? itens : JSON.stringify(itens);

        const novo = await prisma.orcamento.create({
            data: { 
                nome, 
                itens: itensString, 
                total: parseFloat(total), 
                afiliadoId,
                // 3. Adicionei o campo no banco de dados
                clienteDoc: clienteDoc || null 
            }
        });

        res.json({ mensagem: "Salvo!", id: novo.id });

    } catch (e) { 
        console.error("Erro no backend:", e); // Mostra o erro no terminal se houver
        res.status(500).json({ erro: "Erro ao salvar." }); 
    }
});

app.get('/afiliado/orcamentos', authenticateToken, async (req, res) => {
    try {
        const orcamentos = await prisma.orcamento.findMany({
            where: { afiliadoId: req.user.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json(orcamentos);
    } catch (e) { res.status(500).json({ erro: "Erro ao buscar orçamentos." }); }
});

app.delete('/orcamentos/:id', authenticateToken, async (req, res) => {
    try {
        await prisma.orcamento.deleteMany({ where: { id: parseInt(req.params.id), afiliadoId: req.user.id } });
        res.json({ mensagem: "Deletado" });
    } catch (e) { res.status(500).json({ erro: "Erro ao deletar." }); }
});

// 3. MEUS CLIENTES (CRM)
app.get('/afiliado/meus-clientes', authenticateToken, async (req, res) => {
    try {
        const afiliadoId = req.user.id; 
        const vendas = await prisma.pedido.findMany({
            where: { afiliadoId: afiliadoId },
            orderBy: { createdAt: 'desc' }
        });

        const clientesMap = new Map();
        vendas.forEach(venda => {
            if (!clientesMap.has(venda.clienteEmail)) {
                clientesMap.set(venda.clienteEmail, {
                    nome: venda.clienteNome,
                    email: venda.clienteEmail,
                    telefone: venda.clienteTelefone || "Não informado",
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
        res.json(Array.from(clientesMap.values()));
    } catch (e) { res.status(500).json({ erro: "Erro ao buscar clientes" }); }
});

// ============================================================
// 👥 GESTÃO DE CLIENTES (CADASTRO DO AFILIADO)
// ============================================================

// 1. Cadastrar Novo Cliente (PF ou PJ)
app.post('/afiliado/cadastrar-cliente', authenticateToken, async (req, res) => {
    try {
        const { nome, tipo, documento, telefone, email, endereco } = req.body;
        
        await prisma.clienteAfiliado.create({
            data: {
                nome, tipo, documento, telefone, email, endereco,
                afiliadoId: req.user.id
            }
        });
        
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ erro: "Erro ao cadastrar cliente." });
    }
});

// 2. Listar Clientes Cadastrados
app.get('/afiliado/meus-clientes-cadastrados', authenticateToken, async (req, res) => {
    try {
        const clientes = await prisma.clienteAfiliado.findMany({
            where: { afiliadoId: req.user.id },
            orderBy: { nome: 'asc' }
        });
        res.json(clientes);
    } catch (e) {
        res.status(500).json({ erro: "Erro ao buscar clientes." });
    }
});

// 4. ATUALIZAR PERFIL (Pix, Banco)
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

app.put('/afiliado/perfil-completo', authenticateToken, async (req, res) => {
    const { id } = req.user; // Pega o ID do token
    const { nome, cpf, telefone, endereco, chavePix, banco, agencia, conta, senha } = req.body;

    // Validação Backend: Apenas o essencial para pagar é obrigatório
    if (!nome || !cpf || !telefone || !endereco || !chavePix) {
        return res.status(400).json({ erro: "Preencha os campos obrigatórios (Nome, CPF, Telefone, Endereço, Pix)." });
    }

    try {
        const dadosAtualizar = {
            nome, cpf, telefone, endereco, chavePix, banco, agencia, conta
            // Note que NÃO coloquei 'foto' aqui ainda (explico abaixo)
        };

        // Só atualiza a senha se o usuário digitou algo
        if (senha && senha.trim() !== "") {
            dadosAtualizar.password = await bcrypt.hash(senha, 10);
        }

        const afiliadoAtualizado = await prisma.afiliado.update({
            where: { id: id },
            data: dadosAtualizar
        });

        // Remove a senha antes de devolver pro front
        const { password, ...dadosSeguros } = afiliadoAtualizado;
        
        res.json({ mensagem: "Perfil atualizado!", afiliado: dadosSeguros });

    } catch (error) {
        console.error("Erro perfil:", error);
        res.status(500).json({ erro: "Erro ao atualizar perfil." });
    }
});

// 5. NOTIFICAÇÕES E MENSAGENS
app.get('/afiliado/notificacoes', authenticateToken, async (req, res) => {
    try {
        const id = req.user.id;
        const mensagens = await prisma.mensagem.findMany({
            where: { afiliadoId: id, lida: false },
            orderBy: { createdAt: 'desc' }
        });
        const vendas = await prisma.pedido.findMany({
            where: { afiliadoId: id, notificado_afiliado: false },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ mensagens, vendas });
    } catch (e) { res.status(500).json({ mensagens: [], vendas: [] }); }
});

app.post('/afiliado/notificacoes/ler', authenticateToken, async (req, res) => {
    try {
        const id = req.user.id;
        await prisma.mensagem.updateMany({ where: { afiliadoId: id, lida: false }, data: { lida: true } });
        await prisma.pedido.updateMany({ where: { afiliadoId: id, notificado_afiliado: false }, data: { notificado_afiliado: true } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erro ao limpar" }); }
});

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

// =================================================================
// 🛒 PEDIDOS E PAGAMENTO
// =================================================================
app.post('/finalizar-pedido', async (req, res) => {
    try {
        const { cliente, itens, afiliadoCodigo } = req.body;
        let valorTotal = 0;
        let comissaoReal = 0;
        let itensParaBanco = [];
        let itensTextoZap = ""; 

        for (const i of itens) {
            valorTotal += (i.unitario * i.qtd);
            itensTextoZap += `${i.qtd}x ${i.nome} | `;
            itensParaBanco.push({
                id: parseInt(i.id),
                nome: i.nome,
                qtd: parseInt(i.qtd),
                unitario: i.unitario
            });

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
            clienteTelefone: cliente.whatsapp || cliente.telefone,
            clienteEndereco: cliente.endereco,
            valorTotal: valorTotal,
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

        // ROBÔ DO ZAP
        try {
            const SEU_TELEFONE = "558287515891"; 
            const API_KEY = "6414164"; 
            const msg = `🔔 *Nova Venda!* (#${pedido.id})\n💰 R$ ${valorTotal.toFixed(2)}\n📦 ${itensTextoZap}`;
            const urlBot = `https://api.callmebot.com/whatsapp.php?phone=${SEU_TELEFONE}&text=${encodeURIComponent(msg)}&apikey=${API_KEY}`;
            fetch(urlBot).catch(e => console.error("Erro Zap", e));
        } catch (e) {}

        res.json(pedido);

    } catch (error) { 
        console.error("ERRO FINALIZAR:", error);
        res.status(500).json({ erro: "Erro ao processar" }); 
    }
});

// Adicione junto com as outras rotas de /afiliado/

app.get('/afiliado/buscar-cliente/:doc', authenticateToken, async (req, res) => {
    try {
        const { doc } = req.params;
        
        // Busca cliente pelo Documento (CPF/CNPJ) E que pertença a este afiliado
        const cliente = await prisma.clienteAfiliado.findFirst({
            where: {
                documento: doc,
                afiliadoId: req.user.id
            }
        });

        if (cliente) {
            res.json({ found: true, cliente });
        } else {
            res.json({ found: false });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ erro: "Erro ao buscar cliente" });
    }
});

// =================================================================
// 👑 ÁREA ADMIN (ADMINISTRAÇÃO)
// =================================================================

// DASHBOARD ADMIN
// =================================================================
// 📊 DASHBOARD ADMIN (CÁLCULO FINANCEIRO REAL)
// =================================================================
app.get('/admin/dashboard-stats', authenticateToken, async (req, res) => {
    if (!req.user || req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const { periodo, inicio, fim } = req.query;

        // === CONFIG FINANCEIRA ===
        const CONFIG_FINANCEIRA = {
            impostoGoverno: 0.06,
            taxaAsaasPix: 0.99,
            taxaAsaasBoleto: 1.99,
            taxaAsaasCartaoPct: 0.055,
            taxaAsaasCartaoFixo: 0.49
        };

        // === 1. FILTRO DE DATA ===
        let whereData = {}; 
        const hoje = new Date();

        if (periodo === 'hoje') {
            const start = new Date(hoje.setHours(0, 0, 0, 0));
            const end = new Date(hoje.setHours(23, 59, 59, 999));
            whereData = { createdAt: { gte: start, lte: end } };
        } 
        else if (periodo === '7dias') {
            const start = new Date();
            start.setDate(start.getDate() - 7);
            start.setHours(0, 0, 0, 0);
            whereData = { createdAt: { gte: start } };
        }
        else if (periodo === '30dias') {
            const start = new Date();
            start.setDate(start.getDate() - 30);
            start.setHours(0, 0, 0, 0);
            whereData = { createdAt: { gte: start } };
        }
        else if (periodo === 'mes_atual') {
            const start = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            whereData = { createdAt: { gte: start } };
        }
        else if (inicio && fim) {
            const start = new Date(inicio);
            const end = new Date(fim);
            end.setHours(23, 59, 59, 999);
            whereData = { createdAt: { gte: start, lte: end } };
        }

        // === 2. FILTRO DE SAQUES (CORREÇÃO DO BUG) ===
        // Montamos o objeto dinamicamente para não enviar 'undefined'
        let whereSaque = { status: 'PAGO' };
        if (whereData.createdAt) {
            whereSaque.dataPagamento = whereData.createdAt;
        }

        // === 3. BUSCAS ===
        const [pedidosReais, produtosDB, saquesPagosAgg, saldoPendenteAgg, totalPedidosCount, estoqueBaixoCount, produtosCount] = await Promise.all([
            // A. Pedidos (Gerados)
            prisma.pedido.findMany({
                where: {
                    ...whereData,
                    status: { in: ['APROVADO', 'ENTREGUE', 'ENVIADO', 'DEVOLUCAO_PARCIAL'] }
                },
                select: { id: true, valorTotal: true, comissaoGerada: true, itens: true, metodoPagamento: true, createdAt: true }
            }),
            // B. Custos
            prisma.produto.findMany({ select: { id: true, preco_custo: true, preco_novo: true } }),
            
            // C. Saques Pagos (Fluxo de Caixa)
            prisma.saque.aggregate({
                _sum: { valor: true },
                where: whereSaque // Filtro corrigido
            }),

            // D. Saldo Pendente (O que falta pagar - Geral)
            // Nota: Isso pega o saldo ATUAL de todos, independente de data, pois é dívida acumulada
            prisma.afiliado.aggregate({
                _sum: { saldo: true }
            }),

            // E. Contadores
            prisma.pedido.count({ where: { ...whereData, status: { in: ['APROVADO', 'ENTREGUE', 'ENVIADO'] } } }),
            prisma.produto.count({ where: { estoque: { lte: 5 } } }),
            prisma.produto.count()
        ]);

        // === 4. CÁLCULOS ===
        const mapaCustos = {};
        produtosDB.forEach(p => {
            let custo = parseFloat(p.preco_custo);
            if (!custo || isNaN(custo)) custo = parseFloat(p.preco_novo) * 0.60; 
            mapaCustos[p.id] = custo;
        });

        let faturamentoTotal = 0;
        let custoMercadoriaTotal = 0;
        let impostosTotal = 0;
        let taxasAsaasTotal = 0;
        let comissoesGeradasTotal = 0; 

        for (const pedido of pedidosReais) {
            const valorVenda = parseFloat(pedido.valorTotal || 0);
            faturamentoTotal += valorVenda;
            comissoesGeradasTotal += parseFloat(pedido.comissaoGerada || 0);
            impostosTotal += (valorVenda * CONFIG_FINANCEIRA.impostoGoverno);

            let custoGateway = 0;
            const metodo = pedido.metodoPagamento ? pedido.metodoPagamento.toUpperCase() : 'PIX';
            if (metodo.includes('CARTAO') || metodo.includes('CREDIT')) {
                custoGateway = (valorVenda * CONFIG_FINANCEIRA.taxaAsaasCartaoPct) + CONFIG_FINANCEIRA.taxaAsaasCartaoFixo;
            } else if (metodo.includes('BOLETO')) {
                custoGateway = CONFIG_FINANCEIRA.taxaAsaasBoleto;
            } else {
                custoGateway = CONFIG_FINANCEIRA.taxaAsaasPix;
            }
            taxasAsaasTotal += custoGateway;

            try {
                const listaItens = typeof pedido.itens === 'string' ? JSON.parse(pedido.itens) : pedido.itens;
                if (Array.isArray(listaItens)) {
                    listaItens.forEach(item => {
                        const idProd = parseInt(item.id || item.produtoId);
                        const qtd = parseInt(item.qtd || item.quantidade || 1);
                        const custoUnitario = mapaCustos[idProd] || 0; 
                        custoMercadoriaTotal += (custoUnitario * qtd);
                    });
                }
            } catch (err) {}
        }

        const lucroLiquidoReal = faturamentoTotal - (custoMercadoriaTotal + impostosTotal + taxasAsaasTotal + comissoesGeradasTotal);

        // === 5. ULTIMOS PEDIDOS ===
        const ultimosPedidos = await prisma.pedido.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            where: { ...whereData },
            include: { afiliado: { select: { nome: true } } }
        });

        res.json({
            faturamento: faturamentoTotal,
            lucroLiquido: lucroLiquidoReal,
            
            // OS TRÊS DADOS DE COMISSÃO:
            comissoesPagas: saquesPagosAgg._sum.valor || 0, // O que saiu da conta (DRE Fluxo)
            comissoesGeradas: comissoesGeradasTotal,       // O custo gerado (DRE Competência)
            comissoesPendentes: saldoPendenteAgg._sum.saldo || 0, // Dívida atual (O que falta pagar)

            totalPedidos: totalPedidosCount,
            produtos: produtosCount,
            estoqueBaixo: estoqueBaixoCount,
            ultimosPedidos
        });

    } catch (e) {
        console.error("Erro Dashboard Admin:", e);
        res.status(500).json({ erro: e.message });
    }
});
// LISTAR PEDIDOS
app.get('/admin/pedidos', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const pedidos = await prisma.pedido.findMany({
            orderBy: { createdAt: 'desc' },
            include: { afiliado: true } 
        });
        res.json(pedidos);
    } catch (e) { res.status(500).json({ erro: "Erro ao buscar pedidos" }); }
});

// MUDAR STATUS DO PEDIDO (Estoque e Comissão)
app.put('/admin/orders/:id/status', authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status, itens, novoTotal } = req.body; 

        const pedidoAntigo = await prisma.pedido.findUnique({ 
            where: { id: id },
            include: { afiliado: true }
        });

        if (!pedidoAntigo) return res.status(404).json({ erro: "Pedido não encontrado" });

        // =================================================================================
        // 1. BAIXA DE ESTOQUE (QUANDO APROVA)
        // =================================================================================
        if (status === 'APROVADO' && pedidoAntigo.status !== 'APROVADO') {
            try {
                const listaItens = typeof pedidoAntigo.itens === 'string' ? JSON.parse(pedidoAntigo.itens) : pedidoAntigo.itens;
                if (Array.isArray(listaItens)) {
                    for (const item of listaItens) {
                        if(item.id) {
                            await prisma.produto.update({
                                where: { id: item.id },
                                data: { estoque: { decrement: item.qtd } }
                            });
                        }
                    }
                }
            } catch (err) { console.error("Erro estoque:", err); }
        }

        // =================================================================================
        // 2. LIBERAR COMISSÃO (QUANDO APROVA)
        // =================================================================================
        if (status === 'APROVADO' && pedidoAntigo.status !== 'APROVADO') {
            if (pedidoAntigo.afiliadoId && pedidoAntigo.comissaoGerada > 0) {
                await prisma.afiliado.update({
                    where: { id: pedidoAntigo.afiliadoId },
                    data: { saldo: { increment: pedidoAntigo.comissaoGerada } }
                });
            }
        }

        // =================================================================================
        // 3. ESTORNO TOTAL (QUANDO CANCELA PEDIDO JÁ APROVADO/DEVOLVIDO)
        // =================================================================================
        if (status === 'CANCELADO' && (pedidoAntigo.status === 'APROVADO' || pedidoAntigo.status === 'ENTREGUE' || pedidoAntigo.status === 'DEVOLUCAO_PARCIAL')) {
            // Tira o dinheiro do afiliado
            if (pedidoAntigo.afiliadoId && pedidoAntigo.comissaoGerada > 0) {
                await prisma.afiliado.update({
                    where: { id: pedidoAntigo.afiliadoId },
                    data: { saldo: { decrement: pedidoAntigo.comissaoGerada } }
                });
            }
            // Devolve TUDO ao estoque
            try {
                const listaItens = typeof pedidoAntigo.itens === 'string' ? JSON.parse(pedidoAntigo.itens) : pedidoAntigo.itens;
                if (Array.isArray(listaItens)) {
                    for (const item of listaItens) {
                        if(item.id) {
                            await prisma.produto.update({
                                where: { id: item.id },
                                data: { estoque: { increment: item.qtd } }
                            });
                        }
                    }
                }
            } catch(e) {}
        }

        // =================================================================================
        // 4. DEVOLUÇÃO PARCIAL (FINANCEIRO + ESTOQUE AUTOMÁTICO)
        // =================================================================================
        let dadosAtualizacao = { status: status }; 
        
        if (status === 'DEVOLUCAO_PARCIAL') {
            if (novoTotal !== undefined && itens) {
                
                // A. ESTORNO FINANCEIRO DO AFILIADO (PROPORCIONAL)
                if (pedidoAntigo.afiliadoId && (pedidoAntigo.status === 'APROVADO' || pedidoAntigo.status === 'ENTREGUE' || pedidoAntigo.status === 'DEVOLUCAO_PARCIAL')) {
                    const valorAntigo = parseFloat(pedidoAntigo.valorTotal);
                    const valorNovo = parseFloat(novoTotal);
                    const diferencaValor = valorAntigo - valorNovo;
                    
                    if (diferencaValor > 0 && valorAntigo > 0) {
                        const porcentagemDevolvida = diferencaValor / valorAntigo;
                        const valorEstorno = pedidoAntigo.comissaoGerada * porcentagemDevolvida;

                        await prisma.afiliado.update({
                            where: { id: pedidoAntigo.afiliadoId },
                            data: { saldo: { decrement: valorEstorno } }
                        });

                        const novaComissao = pedidoAntigo.comissaoGerada - valorEstorno;
                        dadosAtualizacao.comissaoGerada = novaComissao;
                    }
                }

                // 🟢 B. ESTORNO AUTOMÁTICO DE ESTOQUE (PRODUTOS) 🟢
                try {
                    const listaAntiga = typeof pedidoAntigo.itens === 'string' ? JSON.parse(pedidoAntigo.itens) : pedidoAntigo.itens;
                    const listaNova = typeof itens === 'string' ? JSON.parse(itens) : itens;

                    // Percorre a lista original para ver o que sumiu ou diminuiu
                    for (const itemAntigo of listaAntiga) {
                        // Procura esse mesmo item na lista nova (pelo ID ou Nome se ID falhar)
                        // Se o item não existir na lista nova, assumimos qtd = 0 (foi totalmente devolvido)
                        const itemNovo = listaNova.find(i => (i.id && i.id === itemAntigo.id) || i.nome === itemAntigo.nome) || { qtd: 0 };
                        
                        // Calcula a diferença
                        const qtdAntiga = parseInt(itemAntigo.qtd);
                        const qtdNova = parseInt(itemNovo.qtd);
                        const qtdDevolvida = qtdAntiga - qtdNova;

                        // Se devolveu algo (diferença positiva), devolve pro estoque
                        if (qtdDevolvida > 0 && itemAntigo.id) {
                            await prisma.produto.update({
                                where: { id: itemAntigo.id },
                                data: { estoque: { increment: qtdDevolvida } }
                            });
                        }
                    }
                } catch (erroEstoque) {
                    console.error("Erro ao devolver estoque parcial:", erroEstoque);
                }

                // C. PREPARA DADOS PARA SALVAR NO PEDIDO
                dadosAtualizacao.itens = typeof itens === 'object' ? JSON.stringify(itens) : itens;
                dadosAtualizacao.valorTotal = parseFloat(novoTotal);
            }
        }

        // =================================================================================
        // UPDATE FINAL
        // =================================================================================
        const pedidoAtualizado = await prisma.pedido.update({
            where: { id: id },
            data: dadosAtualizacao
        });

        res.json(pedidoAtualizado);

    } catch (e) { 
        console.error(e);
        res.status(500).json({ erro: e.message }); 
    }
});

// Rota para pegar detalhes de UM pedido específico
app.get('/admin/orders/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const id = parseInt(req.params.id);
        const pedido = await prisma.pedido.findUnique({
            where: { id: id },
            include: {
                afiliado: { // Traz os dados do afiliado ligado à venda
                    select: { nome: true, telefone: true, codigo: true }
                }
            }
        });

        if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado" });

        res.json(pedido);
    } catch (e) {
        console.error(e);
        res.status(500).json({ erro: "Erro ao buscar detalhes" });
    }
});

// ============================================================
// 💰 ROTA: SOMATÓRIA TOTAL DE COMISSÕES (SALDOS DOS AFILIADOS)
// ============================================================
app.get('/admin/comissoes-totais', authenticateToken, async (req, res) => {
    try {
        // Soma o campo 'saldo' de todos os afiliados
        const agredado = await prisma.afiliado.aggregate({
            _sum: {
                saldo: true
            }
        });

        // Se não tiver ninguém, retorna 0
        const total = agredado._sum.saldo || 0;

        res.json({ total });
    } catch (e) {
        console.error(e);
        res.status(500).json({ erro: "Erro ao calcular total." });
    }
});

// CRUD PRODUTOS
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
// Rota para LISTAR produtos no Admin com PAGINAÇÃO
app.get('/admin/produtos', authenticateToken, async (req, res) => {
    // 1. Segurança: Só Admin entra
    if(!req.user || req.user.role !== 'admin') return res.sendStatus(403);

    try {
        // 2. Configura a Paginação
        const pagina = parseInt(req.query.page) || 1; // Se não informar, é a página 1
        const limite = 50; // 50 produtos por página
        const pular = (pagina - 1) * limite; // Quantos produtos pular no banco

        // 3. Busca no Banco (Total + Lista da Página)
        const [total, produtos] = await prisma.$transaction([
            prisma.produto.count(), // Conta quantos existem no total
            prisma.produto.findMany({
                take: limite,
                skip: pular,
                orderBy: { id: 'desc' } // Mostra os recém-criados primeiro (topo da lista)
            })
        ]);

        const totalPaginas = Math.ceil(total / limite);

        // 4. Devolve os dados organizados
        res.json({
            data: produtos,
            total: total,
            paginaAtual: pagina,
            totalPaginas: totalPaginas
        });

    } catch (e) {
        console.error("Erro lista admin:", e);
        res.status(500).json({erro: e.message});
    }
});

// ADMIN MENSAGENS E SUGESTÕES
app.post('/admin/mensagens', authenticateToken, upload.single('arquivo'), async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const { afiliadoId, texto } = req.body;
        const arquivoPath = req.file ? req.file.path : null;
        await prisma.mensagem.create({
            data: {
                texto: texto || "",
                arquivo: arquivoPath,
                afiliadoId: parseInt(afiliadoId)
            }
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ erro: "Erro ao enviar." }); }
});

app.get('/admin/afiliados', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const afiliados = await prisma.afiliado.findMany({ include: { pedidos: true } });
        const resposta = afiliados.map(af => ({
            id: af.id, nome: af.nome, telefone: af.telefone, codigo: af.codigo, saldo: af.saldo,
            aprovado: af.aprovado, chavePix: af.chavePix, banco: af.banco, agencia: af.agencia, conta: af.conta,
            vendasTotais: af.pedidos.reduce((acc, p) => acc + p.valorTotal, 0)
        }));
        res.json(resposta);
    } catch (e) { res.status(500).json({ erro: "Erro ao buscar afiliados" }); }
});

app.put('/admin/afiliados/:id/status', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        await prisma.afiliado.update({
            where: { id: parseInt(req.params.id) },
            data: { aprovado: req.body.aprovado }
        });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ erro: "Erro status" }); }
});

// SUGESTÕES
app.post('/afiliado/sugestoes', authenticateToken, async (req, res) => {
    try {
        const { produtoId, termo, motivo } = req.body;
        await prisma.sugestao.create({
            data: { termo, motivo, produtoId: parseInt(produtoId), afiliadoId: req.user.id }
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ erro: "Erro sugestão" }); }
});
app.get('/admin/sugestoes', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const lista = await prisma.sugestao.findMany({ where: { status: 'PENDENTE' }, include: { produto: true, afiliado: true } });
    res.json(lista);
});
app.post('/admin/sugestoes/:id/aprovar', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const sugestao = await prisma.sugestao.findUnique({ where: { id: parseInt(req.params.id) }, include: { produto: true } });
        const tagsAtuais = sugestao.produto.tags || ""; 
        const novasTags = tagsAtuais + " " + sugestao.termo; 
        await prisma.produto.update({ where: { id: sugestao.produtoId }, data: { tags: novasTags } });
        await prisma.sugestao.update({ where: { id: sugestao.id }, data: { status: 'APROVADO' } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ erro: "Erro aprovar" }); }
});
app.post('/admin/sugestoes/:id/rejeitar', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await prisma.sugestao.update({ where: { id: parseInt(req.params.id) }, data: { status: 'REJEITADO' } });
    res.json({ success: true });
});


// ============================================================
// 💸 ROTA: SOLICITAR SAQUE
// ============================================================
app.post('/afiliado/saque', authenticateToken, async (req, res) => {
    try {
        const id = req.user.id;

        // 1. Busca o afiliado para ver o saldo
        const afiliado = await prisma.afiliado.findUnique({ where: { id } });

        if (!afiliado) return res.status(404).json({ erro: "Afiliado não encontrado" });
        if (afiliado.saldo <= 0) return res.status(400).json({ erro: "Saldo insuficiente para saque." });

        const valorSaque = afiliado.saldo;

        // 2. Transação Atômica (Segurança: Faz tudo ou não faz nada)
        // Cria o registro do saque E zera o saldo ao mesmo tempo
        await prisma.$transaction([
            prisma.saque.create({
                data: {
                    valor: valorSaque,
                    afiliadoId: id,
                    status: "PENDENTE"
                }
            }),
            prisma.afiliado.update({
                where: { id },
                data: { saldo: 0 } // Zera a carteira
            })
        ]);

        // 3. AVISA O ADMIN NO WHATSAPP (CallMeBot)
        try {
            const SEU_TELEFONE = "558287515891"; // <--- CONFIRME SEU NÚMERO
            const API_KEY = "6414164";           // <--- CONFIRME SUA API KEY
            
            const msg = `💸 *Solicitação de Saque!* 💸\n\n` +
                        `👤 Parceiro: ${afiliado.nome}\n` +
                        `💰 Valor: R$ ${valorSaque.toFixed(2)}\n` +
                        `🏦 Pix: ${afiliado.chavePix || "Não cadastrado"}\n\n` +
                        `Acesse o banco para pagar.`;

            const urlBot = `https://api.callmebot.com/whatsapp.php?phone=${SEU_TELEFONE}&text=${encodeURIComponent(msg)}&apikey=${API_KEY}`;
            fetch(urlBot).catch(e => console.error("Erro Zap Saque", e));

        } catch (e) {}

        res.json({ success: true, valor: valorSaque });

    } catch (e) {
        console.error("Erro Saque:", e);
        res.status(500).json({ erro: "Erro ao processar saque." });
    }
});

// ============================================================
// 🏦 ROTAS DE SAQUE (HISTÓRICO E PAGAMENTO)
// ============================================================

// 1. AFILIADO: VER MEUS SAQUES
app.get('/afiliado/saques', authenticateToken, async (req, res) => {
    try {
        const saques = await prisma.saque.findMany({
            where: { afiliadoId: req.user.id },
            orderBy: { dataSolicitacao: 'desc' }
        });
        res.json(saques);
    } catch (e) { res.status(500).json({ erro: "Erro ao buscar saques" }); }
});

// ============================================================
// 💰 ROTA ADMIN: CONFIRMAR PAGAMENTO (ATUALIZADA)
// ============================================================
app.post('/admin/saques/:id/confirmar', authenticateToken, upload.single('comprovante'), async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const idSaque = parseInt(req.params.id);
        const arquivoPath = req.file ? req.file.path : null; // Pega o caminho do arquivo

        // 1. Atualiza o Saque para PAGO e SALVA O COMPROVANTE
        await prisma.saque.update({
            where: { id: idSaque },
            data: { 
                status: "PAGO", 
                dataPagamento: new Date(),
                comprovante: arquivoPath // <--- AQUI ESTÁ A MÁGICA
            }
        });

        // 2. Também manda mensagem avisando (Opcional, mas legal manter)
        if (arquivoPath) {
            // Busca o afiliadoId do saque para saber pra quem mandar
            const saque = await prisma.saque.findUnique({ where: { id: idSaque } });
            
            await prisma.mensagem.create({
                data: {
                    texto: `✅ Seu saque de R$ ${saque.valor.toFixed(2)} foi pago!`,
                    arquivo: arquivoPath,
                    afiliadoId: saque.afiliadoId
                }
            });
        }

        res.json({ success: true });

    } catch (e) {
        console.error("Erro ao pagar:", e);
        res.status(500).json({ erro: "Erro ao processar pagamento." });
    }
});

// 3. ADMIN: VER TODOS OS SAQUES PENDENTES
app.get('/admin/saques-pendentes', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
        const saques = await prisma.saque.findMany({
            where: { status: 'PENDENTE' },
            include: { afiliado: true },
            orderBy: { dataSolicitacao: 'asc' }
        });
        res.json(saques);
    } catch (e) { res.status(500).json({ erro: "Erro" }); }
});

// ============================================================
// ROTA DE CHECKOUT (DIVISÃO PROPORCIONAL DE TAXAS) ⚖️
// ============================================================
app.post('/api/checkout/pix', async (req, res) => {
    try {
        const { itens, cliente, afiliadoId, afiliadoCodigo, metodoPagamento } = req.body;

        // 1. Identificar Afiliado
        let idFinalAfiliado = null;
        let walletIdAfiliado = null;
        if (afiliadoId) {
            idFinalAfiliado = parseInt(afiliadoId);
        } else if (afiliadoCodigo) {
            const af = await prisma.afiliado.findUnique({ where: { codigo: afiliadoCodigo } });
            if (af) {
                idFinalAfiliado = af.id;
                walletIdAfiliado = af.walletId;
            }
        }

        let valorTotalVenda = 0;      
        let custoTotalProdutos = 0;   
        let lucroBrutoLoja = 0;       
        let lucroBrutoAfiliado = 0;   
        let itensParaBanco = [];

        // 2. Loop dos Produtos (Cálculo de Lucros e Custos)
        for (const item of itens) {
            const prodBanco = await prisma.produto.findUnique({ where: { id: item.id } });
            if (!prodBanco) continue;

            const limparValor = (val) => {
                if (!val) return 0;
                return parseFloat(String(val).replace(',', '.'));
            };

            const precoLoja = limparValor(prodBanco.preco_novo); 
            const custoPeca = limparValor(prodBanco.preco_custo) || (precoLoja * 0.8); 
            
            const qtd = parseInt(item.quantidade);
            const margemItem = item.customMargin ? parseFloat(item.customMargin) : 0;

            let precoVendaUnitario = precoLoja;
            if (margemItem > 0) {
                precoVendaUnitario = precoLoja * (1 + (margemItem / 100));
            }

            const totalItemVenda = precoVendaUnitario * qtd;
            const totalItemCusto = custoPeca * qtd;
            const totalItemLojaBase = precoLoja * qtd; 

            const faturamentoAfiliado = totalItemVenda - totalItemLojaBase; 
            const faturamentoLoja = totalItemLojaBase - totalItemCusto;

            valorTotalVenda += totalItemVenda;
            custoTotalProdutos += totalItemCusto;
            lucroBrutoAfiliado += faturamentoAfiliado;
            lucroBrutoLoja += faturamentoLoja;

            itensParaBanco.push({
                id: prodBanco.id, 
                nome: prodBanco.titulo, 
                qtd: qtd,
                unitario: precoVendaUnitario, 
                total: totalItemVenda, 
                imagem: prodBanco.imagem
            });
        }

        // 3. CÁLCULO DAS TAXAS TOTAIS
        let custoTaxasTotal = 0;
        const valorImposto = valorTotalVenda * CONFIG_FINANCEIRA.impostoGoverno;
        custoTaxasTotal += valorImposto;

        // Define o método limpo (PIX ou CARTAO)
        const metodoPuro = metodoPagamento ? metodoPagamento.toUpperCase().trim() : 'PIX';

        if (metodoPuro === 'CARTAO') {
            custoTaxasTotal += (valorTotalVenda * CONFIG_FINANCEIRA.taxaAsaasCartaoPct) + CONFIG_FINANCEIRA.taxaAsaasCartaoFixo;
        } else {
            custoTaxasTotal += CONFIG_FINANCEIRA.taxaAsaasPix;
        }

        // 4. RATEIO PROPORCIONAL
        const lucroOperacionalTotal = lucroBrutoLoja + lucroBrutoAfiliado;
        let comissaoLiquidaAfiliado = 0;
        let parteTaxaAfiliado = 0;
        let parteTaxaLoja = custoTaxasTotal;
        let lucroLiquidoLoja = lucroBrutoLoja - custoTaxasTotal;

        if (lucroOperacionalTotal > 0 && lucroBrutoAfiliado > 0) {
            const pesoAfiliado = lucroBrutoAfiliado / lucroOperacionalTotal;
            parteTaxaAfiliado = custoTaxasTotal * pesoAfiliado;
            comissaoLiquidaAfiliado = lucroBrutoAfiliado - parteTaxaAfiliado;
            parteTaxaLoja = custoTaxasTotal - parteTaxaAfiliado;
            lucroLiquidoLoja = lucroBrutoLoja - parteTaxaLoja;
        }
        if (comissaoLiquidaAfiliado < 0) comissaoLiquidaAfiliado = 0;

        // 5. GERAÇÃO DA COBRANÇA
        let dadosAsaas;
        
        if (metodoPuro === 'CARTAO') {
            dadosAsaas = await criarLinkPagamento(
                cliente, 
                valorTotalVenda, 
                `Pedido Cartão - AutoPeças`,
                walletIdAfiliado,
                comissaoLiquidaAfiliado
            );
        } else {
            dadosAsaas = await criarCobrancaPixDireto( 
                cliente, 
                valorTotalVenda, 
                `Pedido PIX - AutoPeças`,
                walletIdAfiliado,
                comissaoLiquidaAfiliado
            );
        }

        // --- LOG DE AUDITORIA ---
        const pctTaxaSobreLoja = lucroBrutoLoja > 0 ? (parteTaxaLoja / lucroBrutoLoja) * 100 : 0;
        const pctTaxaSobreAfiliado = lucroBrutoAfiliado > 0 ? (parteTaxaAfiliado / lucroBrutoAfiliado) * 100 : 0;
        const margemLiquidaLoja = valorTotalVenda > 0 ? (lucroLiquidoLoja / valorTotalVenda) * 100 : 0;

        console.log(`
        ============================================================
        📊 AUDITORIA DE TAXAS - MÉTODO: ${metodoPuro}
        ============================================================
        💰 VENDA TOTAL:          R$ ${valorTotalVenda.toFixed(2)}
        📦 CUSTO PRODUTOS:       R$ ${custoTotalProdutos.toFixed(2)}
        ------------------------------------------------------------
        🧾 TAXAS TOTAIS (CONTA): R$ ${custoTaxasTotal.toFixed(2)}
        
        ⚖️ QUEM PAGOU A CONTA (RATEIO):
        🏢 LOJA:
           - Lucro Bruto:        R$ ${lucroBrutoLoja.toFixed(2)}
           - Taxa Paga:         -R$ ${parteTaxaLoja.toFixed(2)} (${pctTaxaSobreLoja.toFixed(1)}% do lucro)
           - LUCRO LÍQUIDO:      R$ ${lucroLiquidoLoja.toFixed(2)} (Margem Final: ${margemLiquidaLoja.toFixed(1)}%)

        🤝 AFILIADO:
           - Lucro Bruto:        R$ ${lucroBrutoAfiliado.toFixed(2)}
           - Taxa Paga:         -R$ ${parteTaxaAfiliado.toFixed(2)} (${pctTaxaSobreAfiliado.toFixed(1)}% do lucro)
           - COMISSÃO LÍQUIDA:   R$ ${comissaoLiquidaAfiliado.toFixed(2)}
        ============================================================
        `);

        // 🟢 SALVA O PEDIDO COM O MÉTODO DE PAGAMENTO CORRETO
        const novoPedido = await prisma.pedido.create({
            data: {
                clienteNome: cliente.nome,
                clienteDoc: cliente.documento,
                clienteEmail: cliente.email,
                clienteTelefone: cliente.telefone,
                clienteEndereco: cliente.endereco,
                valorTotal: valorTotalVenda,
                itens: JSON.stringify(itensParaBanco),
                status: 'AGUARDANDO_PAGAMENTO',
                asaasId: dadosAsaas.id, 
                afiliadoId: idFinalAfiliado, 
                comissaoGerada: comissaoLiquidaAfiliado,
                
                // AQUI ESTÁ A CORREÇÃO:
                metodoPagamento: metodoPuro // Salva "PIX" ou "CARTAO"
            }
        });

        // Resposta para o Modal
        res.json({
            sucesso: true,
            pedidoId: novoPedido.id,
            pix: {
                payload: dadosAsaas.payload,           
                encodedImage: dadosAsaas.encodedImage  
            }, 
            linkPagamento: dadosAsaas.invoiceUrl       
        });

    } catch (e) {
        console.error("Erro checkout:", e);
        res.status(500).json({ erro: e.message });
    }
});


// ==============================================================
// 🤖 WEBHOOK ASAAS (RECEBE CONFIRMAÇÃO DE PAGAMENTO)
// ==============================================================
// ==============================================================
// 🤖 WEBHOOK ASAAS (ATUALIZAÇÃO AUTOMÁTICA)
// ==============================================================
app.post('/api/webhook/asaas', async (req, res) => {
    try {
        // 1. SEGURANÇA
        const tokenRecebido = req.headers['asaas-access-token'];
        if (tokenRecebido !== process.env.ASAAS_WEBHOOK_TOKEN) {
            return res.status(401).json({ error: 'Token inválido' });
        }

        const { event, payment } = req.body;
        console.log(`🔔 Webhook: ${event} | ID: ${payment.id}`);

        // 2. VERIFICA SE O PAGAMENTO FOI CONFIRMADO
        if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
            
            // 🟢 ATUALIZAÇÃO: Busca pelo ID do Pagamento OU pelo ID do Link
            const pedido = await prisma.pedido.findFirst({
                where: { 
                    OR: [
                        { asaasId: payment.id },          // Se foi cobrança direta
                        { asaasId: payment.paymentLink }  // Se foi Link de Pagamento
                    ]
                }
            });

            if (!pedido) {
                console.log("⚠️ Pedido não encontrado para este pagamento.");
                return res.json({ received: true });
            }

            // Evita processar duas vezes se já estiver aprovado
            if (pedido.status === 'APROVADO' || pedido.status === 'PAGO') {
                return res.json({ received: true });
            }

            // =================================================
            // 3. ATUALIZAÇÕES NO BANCO DE DADOS
            // =================================================
            
            // A. Atualiza Status do Pedido
            await prisma.pedido.update({
                where: { id: pedido.id },
                data: { status: 'APROVADO' }
            });
            await enviarPedidoParaTiny(pedido);

            // B. Libera Comissão do Afiliado (se tiver)
            if (pedido.afiliadoId && pedido.comissaoGerada > 0) {
                await prisma.afiliado.update({
                    where: { id: pedido.afiliadoId },
                    data: { saldo: { increment: pedido.comissaoGerada } }
                });
                console.log(`💰 Comissão liberada: R$ ${pedido.comissaoGerada}`);
            }

            // C. Baixa no Estoque
            try {
                const listaItens = JSON.parse(pedido.itens);
                for (const item of listaItens) {
                    await prisma.produto.update({
                        where: { id: item.id },
                        data: { estoque: { decrement: item.qtd } }
                    });
                }
                console.log("📦 Estoque atualizado!");
            } catch (err) {
                console.error("Erro ao baixar estoque:", err);
            }

            console.log(`✅ PEDIDO #${pedido.id} APROVADO COM SUCESSO!`);
        }

        res.json({ received: true });

    } catch (error) {
        console.error("Erro Fatal no Webhook:", error);
        res.status(500).json({ error: 'Erro interno' });
    }
});

// ROTA PARA O DASHBOARD DO AFILIADO (Cards de Resumo)
app.get('/afiliado/estatisticas', authenticateToken, async (req, res) => {
    try {
        const { inicio, fim } = req.query; // Datas enviadas pelo filtro do dashboard
        const afiliadoId = req.user.id; // Pegando o ID do afiliado logado pelo token

        // Filtro de data básico
        const filtroData = {};
        if (inicio && fim) {
            filtroData.createdAt = {
                gte: new Date(inicio + "T00:00:00Z"),
                lte: new Date(fim + "T23:59:59Z")
            };
        }

        // Busca pedidos APROVADOS ou ENTREGUES para não somar lixo/cancelados
        const pedidos = await prisma.pedido.findMany({
            where: {
                afiliadoId: afiliadoId,
                status: { in: ['APROVADO', 'ENTREGUE'] },
                ...filtroData
            },
            select: {
                valorTotal: true,
                comissaoGerada: true
            }
        });

        // Somatória manual dos valores
        const totalVendas = pedidos.reduce((acc, p) => acc + parseFloat(p.valorTotal || 0), 0);
        const lucroLiquido = pedidos.reduce((acc, p) => acc + parseFloat(p.comissaoGerada || 0), 0);

        res.json({
            vendasTotais: totalVendas,
            lucroLiquido: lucroLiquido
        });

    } catch (e) {
        console.error("Erro nas estatísticas:", e);
        res.status(500).json({ erro: "Erro ao carregar dados do período." });
    }
});



// 1. Rota para iniciar a autorização
// Você vai acessar: seu-site.com/admin/tiny/autorizar
app.get('/admin/tiny/autorizar', (req, res) => {
    const clientId = process.env.TINY_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.TINY_REDIRECT_URI);
    
    // URL oficial da documentação que você enviou
    const url = `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=openid&response_type=code`;
    
    res.redirect(url);
});

// 2. Rota de Callback (Onde o Tiny devolve o 'code')
// Essa URL deve ser EXATAMENTE a mesma que você cadastrou no painel do Tiny
app.get('/tiny/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) return res.send("Erro: Código não fornecido pelo Tiny.");

    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('client_id', process.env.TINY_CLIENT_ID);
        params.append('client_secret', process.env.TINY_CLIENT_SECRET);
        params.append('redirect_uri', process.env.TINY_REDIRECT_URI);
        params.append('code', code);

        const response = await axios.post('https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token', params);

        const { access_token, refresh_token, expires_in } = response.data;
        
        // Calcula quando o token vai vencer (expires_in vem em segundos, ex: 14400 = 4h)
        const dataExpiracao = new Date(Date.now() + (expires_in * 1000));

        // Salva no banco (usando upsert para criar ou atualizar o ID 1)
        await prisma.tinyConfig.upsert({
            where: { id: 1 },
            update: { 
                accessToken: access_token, 
                refreshToken: refresh_token, 
                expiresAt: dataExpiracao 
            },
            create: { 
                id: 1, 
                accessToken: access_token, 
                refreshToken: refresh_token, 
                expiresAt: dataExpiracao 
            }
        });

        res.send("<h1>✅ Sucesso!</h1><p>Seu sistema agora está conectado ao Tiny V3.</p>");

    } catch (error) {
        console.error("Erro no Callback:", error.response?.data || error.message);
        res.status(500).send("Erro ao obter token. Verifique os logs.");
    }
});

app.get('/admin/sincronizar-tiny/:referencia', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    
    const { referencia } = req.params;
    const TOKEN = process.env.TINY_TOKEN;

    try {
        const url = `https://api.tiny.com.br/api2/produto.obter.php?token=${TOKEN}&formato=json&codigo=${referencia}`;
        const response = await axios.get(url);

        if (response.data.retorno.status === 'OK') {
            const prodTiny = response.data.retorno.produto;

            // Atualiza o seu banco de dados com os dados novos do Tiny
            const produtoAtualizado = await prisma.produto.update({
                where: { referencia: referencia }, // Certifique-se que 'referencia' é UNIQUE no prisma
                data: {
                    preco_custo: parseFloat(prodTiny.preco_custo),
                    estoque: parseInt(prodTiny.quantidade_estoque),
                    // Você pode sincronizar o preço de venda também se quiser
                    // preco_novo: parseFloat(prodTiny.preco) 
                }
            });

            res.json({ mensagem: "Sincronizado com sucesso!", produto: produtoAtualizado });
        } else {
            res.status(404).json({ erro: "Produto não encontrado no Tiny" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: "Erro ao conectar com Tiny" });
    }
});

app.post('/enviar-produto', async (req, res) => {
    try {
        // Você chama a função e ela resolve tudo (vencimento, banco, renovação) sozinha!
        const token = await getValidToken();

        // Agora usa o token no Header Bearer (Padrão V3)
        const response = await axios.post('https://api.tiny.com.br/public-api/v3/produtos', seuObjeto, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});
// Rota para enviar um produto do seu banco para o Tiny

app.post('/admin/teste-v3-direto', authenticateToken, async (req, res) => {
    try {
        const tokenV3 = "COLE_AQUI_SEU_TOKEN_DA_IMAGEM_6b9...";

        const produtoTeste = {
            nome: "PRODUTO TESTE V3",
            codigo: "TESTE-" + Date.now(),
            preco: 125.50,
            unidade: "UN",
            tipo: "P"
        };

        const response = await axios.post('https://api.tiny.com.br/public-api/v3/produtos', produtoTeste, {
            headers: {
                'Authorization': `Bearer ${tokenV3}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({ msg: "FINALMENTE FUNCIONOU!", data: response.data });
    } catch (error) {
        res.status(500).json({ erro: error.response?.data || error.message });
    }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));



// ROTA: ENVIAR PRODUTO DO SITE PARA O TINY (CORRIGIDA V3 FINAL)
app.post('/admin/enviar-ao-tiny/:id', authenticateToken, async (req, res) => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const id = parseInt(req.params.id);
        const produto = await prisma.produto.findUnique({ where: { id } });

        if (!produto) return res.status(404).json({ erro: "Produto não encontrado" });

        let tokenFinal;
        try { tokenFinal = await getValidToken(); } 
        catch (e) { return res.status(401).json({ erro: "Token expirado. Reautorize." }); }

        // Limpeza de Strings
        const removerAcentos = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
        const precoVenda = parseFloat(String(produto.preco_novo || produto.preco || 0).replace(',', '.'));
        const precoCusto = parseFloat(String(produto.preco_custo || 0).replace(',', '.'));
        const estoque = parseInt(produto.estoque || 0);

        // === CORREÇÃO DOS CAMPOS E TIPOS ===
        const payloadCriacao = {
            sku: String(produto.referencia || produto.sku || `PROD-${id}`).trim(),
            
            // CORREÇÃO 1: O campo obrigatório é 'descricao', não 'nome'
            descricao: removerAcentos(produto.titulo).substring(0, 120).trim(), 
            
            tipo: "S",
            situacao: "A",
            unidade: "UN",
            origem: "0",
            ncm: String(produto.ncm || "87089990").replace(/\./g, ""),
            
            precos: {
                preco: precoVenda,
                precoCusto: precoCusto,
                precoPromocional: 0
            },
            
            estoque: {
                // CORREÇÃO 2: Enviar true/false (booleano) em vez de "S"/"N"
                controlar: true, 
                sobEncomenda: false
            }
        };

        console.log(`🚀 (1/3) Criando ${payloadCriacao.sku} no Tiny...`);

        // PASSO 1: POST DE CRIAÇÃO
        const response = await axios.post('https://api.tiny.com.br/public-api/v3/produtos', payloadCriacao, {
            headers: { 'Authorization': `Bearer ${tokenFinal}`, 'Content-Type': 'application/json' }
        });

        const idTiny = response.data.data?.id || response.data.id;
        console.log(`✅ Criado! ID Tiny: ${idTiny}. Aguardando 3s...`);
        
        await sleep(3000); 

        // PASSO 2: LANÇAR ESTOQUE (Se houver)
        if (estoque > 0) {
            try {
                const payloadEstoque = {
                    estoque: {
                        quantidade: estoque,
                        tipo: "B",
                        observacao: "Carga Inicial Site",
                        custoUnitario: precoCusto > 0 ? precoCusto : precoVenda
                    }
                };

                await axios.post(`https://api.tiny.com.br/public-api/v3/estoque/${idTiny}`, payloadEstoque, { 
                    headers: { 'Authorization': `Bearer ${tokenFinal}` } 
                });
                console.log(`✅ Estoque lançado.`);
            } catch (errEstoque) {
                console.error("⚠️ Erro Estoque:", errEstoque.message);
            }
        }

        // PASSO 3: VINCULAR
        await prisma.produto.update({ 
            where: { id: id }, 
            data: { tinyId: String(idTiny) } 
        });
        
        return res.json({ sucesso: true, msg: "Produto enviado com sucesso!", tinyId: idTiny });

    } catch (error) {
        const erroMsg = error.response?.data?.erros?.[0]?.mensagem || error.response?.data?.mensagem || error.message;
        const detalhes = JSON.stringify(error.response?.data?.detalhes || "");
        console.error("❌ Erro ao enviar:", erroMsg, detalhes);
        res.status(500).json({ erro: `Tiny rejeitou: ${erroMsg} ${detalhes}` });
    }
});

// ROTA DE TESTE: Tenta descobrir qual a URL de estoque correta
app.get('/admin/teste-estoque/:idTiny', async (req, res) => {
    const idTiny = req.params.idTiny;
    const qtdTeste = 15; // Vamos tentar lançar 15 unidades

    try {
        const token = await getValidToken();
        let log = `<h1>🕵️ Diagnóstico de Estoque para ID: ${idTiny}</h1>`;

        // TENTATIVA 1: URL Geral (POST /estoque)
        log += "<h3>Tentativa 1: POST /estoque</h3>";
        try {
            await axios.post('https://api.tiny.com.br/public-api/v3/estoque', {
                produto: { id: idTiny },
                quantidade: qtdTeste,
                tipo: "E",
                observacao: "Teste 1"
            }, { headers: { 'Authorization': `Bearer ${token}` } });
            log += "<p style='color:green'>✅ SUCESSO! A URL certa é a Geral.</p>";
        } catch (e) {
            log += `<p style='color:red'>❌ Falhou (Erro ${e.response?.status})</p>`;
        }

        // TENTATIVA 2: URL Específica (POST /produtos/ID/estoque)
        log += "<h3>Tentativa 2: POST /produtos/{id}/estoque</h3>";
        try {
            await axios.post(`https://api.tiny.com.br/public-api/v3/produtos/${idTiny}/estoque`, {
                quantidade: qtdTeste,
                tipo: "E",
                observacao: "Teste 2"
            }, { headers: { 'Authorization': `Bearer ${token}` } });
            log += "<p style='color:green'>✅ SUCESSO! A URL certa é a Específica.</p>";
        } catch (e) {
            log += `<p style='color:red'>❌ Falhou (Erro ${e.response?.status})</p>`;
        }

        // TENTATIVA 3: URL Direta (PUT /estoque/ID)
        log += "<h3>Tentativa 3: PUT /estoque/{id}</h3>";
        try {
            await axios.put(`https://api.tiny.com.br/public-api/v3/estoque/${idTiny}`, {
                saldo: qtdTeste
            }, { headers: { 'Authorization': `Bearer ${token}` } });
            log += "<p style='color:green'>✅ SUCESSO! A URL certa é PUT direto.</p>";
        } catch (e) {
            log += `<p style='color:red'>❌ Falhou (Erro ${e.response?.status})</p>`;
        }

        res.send(log);

    } catch (error) {
        res.send("Erro geral no teste: " + error.message);
    }
});

// ROTA DE EMERGÊNCIA: Reseta o status de integração de TODOS os produtos
// ROTA DE RESET - Versão Blindada
app.get('/admin/resetar-status-tiny', authenticateToken, async (req, res) => {
    // Verifica se o usuário existe antes de ler o 'role' para evitar o Erro 500
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).send("Acesso negado: Somente administradores.");
    }

    try {
        console.log("🔄 Iniciando reset de status do Tiny...");

        // Limpa o tinyId de todos os produtos
        const resultado = await prisma.produto.updateMany({
            data: { tinyId: null } 
        });

        console.log(`✅ Reset concluído. ${resultado.count} produtos liberados.`);
        res.send(`Sucesso! ${resultado.count} produtos foram resetados e estão prontos para reenvio.`);
        
    } catch (error) {
        console.error("❌ Erro no reset:", error);
        res.status(500).send("Erro interno ao tentar resetar os produtos.");
    }
});

app.get('/admin/importar-do-tiny', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
        const tokenFinal = await getValidToken();
        let pagina = 1;
        let totalPaginas = 1;
        let processados = 0;

        console.log("🔄 Iniciando Sincronização Global com Tiny...");

        // Loop para percorrer todas as páginas do Tiny
            console.log("🔄 Iniciando Sincronização Inteligente...");
                    
            console.log("🔄 Iniciando Sincronização (Somente Ativos)...");

        console.log("🔄 Iniciando Sincronização (Correção de SKU)...");

        // Função de "Respiro" (Pausa de X milissegundos)
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        console.log("🔄 Iniciando Sincronização com Pausa...");

        do {
            const response = await axios.get(`https://api.tiny.com.br/public-api/v3/produtos?pagina=${pagina}&limite=100&situacao=A`, {
                headers: { 'Authorization': `Bearer ${tokenFinal}` }
            });

            const corpo = response.data;
            const dados = corpo.data || corpo; 
            const itens = dados.itens || [];
            
            totalPaginas = dados.paginacao?.total_paginas || dados.total_paginas || 1;

            console.log(`Página ${pagina}: Encontrei ${itens.length} itens.`);

            for (const item of itens) {
                const idTiny = String(item.id);
                const sku = item.sku || item.codigo; 

                if (!sku) {
                    console.log(`⚠️ Item ID ${idTiny} ignorado (Sem SKU).`);
                    continue;
                }

                // --- O SEGREDO DO SUCESSO ---
                // Espera 1 segundo antes de chamar o Tiny de novo para não tomar erro 429
                await sleep(1000); 
                // -----------------------------

                try {
                    const detalhe = await axios.get(`https://api.tiny.com.br/public-api/v3/produtos/${idTiny}`, {
                        headers: { 'Authorization': `Bearer ${tokenFinal}` }
                    });
                    
                    const corpoDetalhe = detalhe.data;
                    const p = corpoDetalhe.data || corpoDetalhe;

                    console.log(`📦 Dados do SKU ${sku}:`, JSON.stringify(p));

                    // 1. PREÇO DE VENDA
                    const novoPreco = parseFloat(p.precos?.preco) || parseFloat(p.preco) || 0;
                    
                    // 2. CORREÇÃO DO PREÇO DE CUSTO (Tiny V3 manda 'precoCusto')
                    const novoCusto = parseFloat(p.precos?.precoCusto) || parseFloat(p.precoCusto) || parseFloat(p.precos?.preco_custo) || 0;

                    // 3. ESTOQUE
                    const novoEstoque = parseInt(p.estoque?.quantidade) || parseInt(p.saldo) || parseInt(p.saldo_fisico) || 0;

                    console.log(`   -> Processando ${sku} | Preço: ${novoPreco} | Custo: ${novoCusto} | Estoque: ${novoEstoque}`);

                    const produtoExistente = await prisma.produto.findFirst({
                        where: { sku: sku }
                    });

                    if (produtoExistente) {
                        // ATUALIZAR
                        await prisma.produto.update({
                            where: { id: produtoExistente.id },
                            data: {
                                preco_novo: novoPreco,
                                preco_custo: novoCusto, // Atualizando o custo corretamente
                                estoque: novoEstoque,
                                tinyId: idTiny
                            }
                        });
                        console.log(`✅ ${sku} Atualizado!`);
                    } else {
                        // CRIAR
                        await prisma.produto.create({
                            data: {
                                titulo: p.nome || item.descricao,
                                sku: sku,
                                referencia: sku,
                                preco_novo: novoPreco,
                                preco_custo: novoCusto, // Gravando o custo
                                estoque: novoEstoque,
                                tinyId: idTiny,
                                categoria: p.categoria || "Geral",
                                imagem: "https://placehold.co/600x400?text=Falta+Foto"
                            }
                        });
                        console.log(`✨ ${sku} Criado!`);
                    }
                    
                    processados++;

                } catch (errDet) {
                    if (errDet.response && errDet.response.status === 429) {
                        console.error(`🛑 Bloqueio temporário (429). Esperando 5s...`);
                        await sleep(5000); 
                    } else {
                        console.error(`❌ Erro ao salvar ${sku}:`, errDet.message);
                    }
                }
            }

            pagina++;
        } while (pagina <= totalPaginas);

        res.json({ 
            sucesso: true, 
            msg: `Sincronização concluída! ${processados} produtos foram atualizados/criados.` 
        });

    } catch (error) {
        console.error("❌ Erro Fatal na Importação:", error.response?.data || error.message);
        res.status(500).json({ erro: "Falha ao sincronizar com Tiny" });
    }
});

// ==========================================
// FUNÇÕES AUXILIARES (O Robô que trabalha pra você)
// ==========================================

// ==========================================
// ROTA PRINCIPAL: CHECKOUT (ATUALIZADA)
app.post('/admin/tiny/criar-pedido', async (req, res) => {
    try {
        const tokenFinal = await getValidToken();
        const { itensCarrinho, cliente, valorFrete } = req.body;
        const idClienteTiny = await resolverClienteParaVenda(dadosCliente, token);

        console.log("🚀 INICIANDO PEDIDO PARA:", cliente.nome);

        // --- 1. RESOLVE O CLIENTE (Já está funcionando) ---
        let idClienteFinal = null;
        if (cliente.documento || cliente.cpf) {
            idClienteFinal = await buscarClientePorCPF(cliente.documento || cliente.cpf, tokenFinal);
        }

        if (!idClienteTiny) {
            return res.status(400).json({ erro: "Não foi possível identificar ou criar o cliente no Tiny." });
        }
        
        if (!idClienteFinal) {
            console.log("⚠️ Cliente não achado na busca, tentando criar...");
            await sleep(1000);
            idClienteFinal = await criarClienteNoTiny(cliente, tokenFinal);
            await sleep(1000);
        }

        if (!idClienteFinal) {
            return res.status(500).json({ erro: "FALHA CRÍTICA: Cliente não identificado." });
        }
        console.log("✅ Cliente resolvido ID:", idClienteFinal);


       // --- 2. RESOLVE OS ITENS (COM CORREÇÃO AUTOMÁTICA DE ID) ---
        console.log("🔎 PROCESSANDO ITENS...");

        const itensFormatados = await Promise.all(itensCarrinho.map(async (prod, index) => {
            // 1. Pega o ID que veio (seja id_tiny, tinyId ou id normal)
            let idFinal = prod.id_tiny || prod.tinyId || prod.id;

            console.log(`📦 Item ${index + 1}: Recebi ID ${idFinal}`);

            // 2. A MÁGICA: Se o ID for "Curto" (menos de 6 dígitos), é ID do Site!
            // O ID do Tiny sempre é gigante (ex: 337204975)
            if (idFinal && String(idFinal).length < 6) {
                console.log(`   🕵️ ID ${idFinal} é curto. Buscando TinyID no banco...`);
                
                try {
                    // TENTATIVA 1: Tenta buscar como 'produto' (Portugues)
                    // Se o seu schema for 'model Produto', isso vai funcionar
                    let produtoBanco = null;
                    
                    if (prisma.produto) {
                        produtoBanco = await prisma.produto.findUnique({ where: { id: parseInt(idFinal) } });
                    } else if (prisma.product) {
                        // TENTATIVA 2: Tenta buscar como 'product' (Ingles)
                        produtoBanco = await prisma.product.findUnique({ where: { id: parseInt(idFinal) } });
                    } else {
                        throw new Error("Não encontrei a tabela 'produto' nem 'product' no Prisma!");
                    }

                    if (produtoBanco && produtoBanco.tinyId) {
                        console.log(`   ✅ ENCONTRADO! Trocando ${idFinal} por ${produtoBanco.tinyId}`);
                        idFinal = produtoBanco.tinyId;
                    } else {
                        console.log(`   ❌ Produto ID ${idFinal} não tem tinyId no banco ou não existe.`);
                    }
                } catch (e) {
                    console.error("   ❌ Erro técnico no Prisma:", e.message);
                }
            }

            // 3. Verifica se sobrou algum ID válido
            if (!idFinal) {
                console.warn("   ⚠️ PERIGO: Item sem ID. O Tiny vai rejeitar.");
            }

            return {
                produto: { id: idFinal }, // Agora vai o 337...
                quantidade: prod.quantidade,
                valorUnitario: parseFloat(prod.preco || 0.01)
            };
        }));


        // --- 3. ENVIA O PEDIDO ---
        const payloadPedido = {
            data: new Date().toISOString().split('T')[0],
        
            idContato: idClienteFinal,
            cliente: { id: idClienteTiny },
            itens: itensFormatados,
            naturezaOperacao: { id: 335900648 },
            valorFrete: valorFrete || 0,
            situacao: 0
        };

        console.log("📤 ENVIANDO PEDIDO PRO TINY...");
        const response = await axios.post(
            `https://api.tiny.com.br/public-api/v3/pedidos`, 
            payloadPedido,
            { headers: { 'Authorization': `Bearer ${tokenFinal}` } }
        );

        console.log("🎉 SUCESSO! Pedido criado: " + response.data.data?.numero);
        res.json({ sucesso: true, numero: response.data.data?.numero });

    } catch (error) {
        console.error("❌ ERRO NO SERVER:", JSON.stringify(error.response?.data || error.message));
        res.status(500).json({ erro: "Erro ao processar", detalhes: error.response?.data });
    }
});

// ROTA: RAIO-X COMPLETO (SEM FILTROS)
app.get('/admin/tiny/ver-pedido/:id', async (req, res) => {
    try {
        const tokenFinal = await getValidToken();
        const idPedido = req.params.id;

        const response = await axios.get(
            `https://api.tiny.com.br/public-api/v3/pedidos/${idPedido}`,
            { headers: { 'Authorization': `Bearer ${tokenFinal}` } }
        );

        // Manda o RAW (Cru) para a tela e para o Log
        console.log("📦 JSON COMPLETO DO TINY:", JSON.stringify(response.data, null, 2));
        res.send(response.data); 

    } catch (error) {
        res.status(500).send("Erro: " + (error.response?.data ? JSON.stringify(error.response.data) : error.message));
    }
});


async function buscarClienteCerteiro(cpf, token) {
    const cpfLimpo = cpf.replace(/\D/g, '');
    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

    try {
        // Usamos o parâmetro pesquisa que você confirmou que funciona no site
        const res = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos`, {
            params: { pesquisa: cpfFormatado },
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const lista = res.data.data || [];
        if (Array.isArray(lista) && lista.length > 0) {
            // Conferência de segurança
            const achou = lista.find(c => (c.cpfCnpj || c.cpf_cnpj || '').replace(/\D/g, '') === cpfLimpo);
            return achou ? achou.id : null;
        }
    } catch (e) {
        console.log("⚠️ Erro na busca rápida:", e.message);
    }
    return null;
}
// Função auxiliar (mantenha ou adicione se não tiver)
function checarSeAchou(response) {
    if (response.data && response.data.data && response.data.data.length > 0) {
        console.log(`✅ ACHEI! ID: ${response.data.data[0].id} - Nome: ${response.data.data[0].nome}`);
        return true;
    }
    return false;
}

// Função auxiliar para ver se o Tiny devolveu algo
function checarSeAchou(response) {
    if (response.data && response.data.data && response.data.data.length > 0) {
        console.log(`✅ ACHEI! ID: ${response.data.data[0].id} - Nome: ${response.data.data[0].nome}`);
        return true;
    }
    return false;
}

async function resolverClienteParaVenda(dadosCliente, token) {
    const cpfLimpo = (dadosCliente.documento || dadosCliente.cpf || '').replace(/\D/g, '');

    // 1. TENTATIVA RÁPIDA DE BUSCA (Para economizar tempo)
    let idExistente = await buscarClienteCerteiro(cpfLimpo, token);
    if (idExistente) {
        console.log(`✅ Cliente já identificado pelo CPF: ${idExistente}`);
        return idExistente;
    }

    // 2. SE NÃO ACHOU, TENTA CRIAR
    try {
        console.log("📤 Cliente novo? Tentando cadastrar...");
        const response = await axios.post(
            `https://api.tiny.com.br/public-api/v3/contatos`,
            {
                nome: dadosCliente.nome,
                tipoPessoa: cpfLimpo.length > 11 ? 'J' : 'F',
                cpfCnpj: cpfLimpo,
                endereco: {
                    endereco: dadosCliente.endereco || "Rua nao informada",
                    bairro: dadosCliente.bairro || "Centro",
                    cidade: dadosCliente.cidade || "Maceio",
                    uf: dadosCliente.uf || "AL"
                },
                situacao: "A"
            },
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        return response.data.data?.id || response.data.id;
    } catch (error) {
        const erroMsg = JSON.stringify(error.response?.data || "");
        
        // 3. SE DER ERRO DE "JÁ EXISTE" NO MOMENTO DA CRIAÇÃO
        if (erroMsg.includes("existe") || erroMsg.includes("duplicado")) {
            console.log("⚠️ Tiny confirmou que existe. Capturando ID no erro...");
            const matchId = erroMsg.match(/(\d{9,})/);
            if (matchId) return matchId[1];

            // Se o ID não veio no erro, esperamos 3s e tentamos a busca final por nome
            await new Promise(r => setTimeout(r, 3000));
            const primeiroNome = dadosCliente.nome.split(' ')[0];
            const resNome = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos?pesquisa=${primeiroNome}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const lista = resNome.data.data || [];
            const final = lista.find(c => (c.cpfCnpj || c.cpf_cnpj || '').replace(/\D/g, '') === cpfLimpo);
            return final ? final.id : null;
        }
    }
    return null;
}

// ==========================================
// CRIAR CLIENTE (COM DELAY AUMENTADO)
// ==========================================
async function criarClienteNoTiny(dadosCliente, token) {
    const cpfLimpo = (dadosCliente.documento || dadosCliente.cpf || '').replace(/\D/g, '');
    
    const payloadCliente = {
        "nome": dadosCliente.nome,
        "tipoPessoa": cpfLimpo.length > 11 ? 'J' : 'F',
        "cpfCnpj": cpfLimpo,
        "endereco": {
            "endereco": dadosCliente.endereco || "Rua nao informada",
            "bairro": dadosCliente.bairro || "Centro",
            "cidade": dadosCliente.cidade || "Maceio",
            "uf": dadosCliente.uf || "AL"
        },
        "situacao": "A"
    };

    try {
        console.log("📤 Tentando criar cliente...");
        const response = await axios.post(
            `https://api.tiny.com.br/public-api/v3/contatos`,
            payloadCliente,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        return response.data.data?.id || response.data.id;

    } catch (error) {
        const dadosErro = error.response?.data;
        const msgErro = JSON.stringify(dadosErro);
        console.log("⚠️ Resposta do Tiny no erro:", msgErro);

        // 🔎 ESTRATÉGIA 1: PESCAR O ID NO TEXTO DO ERRO
        // O Tiny costuma mandar algo como: "O contato 890236518 já existe"
        const matchId = msgErro.match(/(\d{9,})/); 
        if (matchId && matchId[1]) {
            console.log(`✅ ID PESCADO COM SUCESSO: ${matchId[1]}`);
            return matchId[1];
        }

        // 🔎 ESTRATÉGIA 2: SE NÃO PESCOU, BUSCA POR NOME COMPLETO
        // Vamos tentar o nome EXATO que está no seu banco (Rafaela souza)
        console.log("🕵️ ID não encontrado no erro. Tentando busca por nome exato...");
        try {
            const resNome = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos`, {
                params: { pesquisa: "Rafaela souza" }, // Use o nome que vimos no diagnóstico
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const lista = resNome.data.data || [];
            const achou = lista.find(c => c.nome.toLowerCase().includes("rafaela"));
            if (achou) return achou.id;
        } catch (e) { console.log("Falha no resgate por nome"); }

        return null; 
    }
}

// ==========================================
// ROTA DE DIAGNÓSTICO PÚBLICA (SEM SENHA)
// ==========================================
// ==========================================================
// 🧪 LABORATÓRIO: TESTA CPF, PARÂMETROS E BUSCA POR NOME
// ==========================================================
app.get('/teste-parametro/:cpf', async (req, res) => {
    const cpfRaw = req.params.cpf;
    const cpfLimpo = cpfRaw.replace(/\D/g, '');
    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    
    // Pega o nome da URL (?nome=Rafaela) ou usa um padrão para teste
    const nomeTeste = req.query.nome || "Rafaela"; 

    const resultados = [];
    const token = await getValidToken();

    console.log(`\n🧪 INICIANDO LABORATÓRIO...`);
    console.log(`🎯 CPF Alvo: ${cpfFormatado}`);
    console.log(`👤 Nome Alvo: ${nomeTeste}`);

    // FUNÇÃO AUXILIAR DE TESTE
    const testarMetodo = async (titulo, params) => {
        let status = "❌ FALHOU";
        let detalhe = "Zero resultados";
        let id = null;

        try {
            // Delay pequeno para não travar a API
            await new Promise(r => setTimeout(r, 500));

            const res = await axios.get(`https://api.tiny.com.br/public-api/v3/contatos`, {
                params: params,
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const lista = res.data.data || [];
            
            if (Array.isArray(lista) && lista.length > 0) {
                // Procura o CPF na lista retornada
                const achou = lista.find(c => {
                    const doc = (c.cpfCnpj || c.cpf_cnpj || '').replace(/\D/g, '');
                    return doc === cpfLimpo;
                });

                if (achou) {
                    status = "✅ SUCESSO";
                    detalhe = `Encontrado ID: ${achou.id} (${achou.nome})`;
                    id = achou.id;
                } else {
                    status = "⚠️ INCONCLUSIVO";
                    detalhe = `Trouxe ${lista.length} nomes, mas CPF não bateu.`;
                }
            }
        } catch (e) {
            status = "🔥 ERRO API";
            detalhe = e.response?.status || e.message;
        }

        resultados.push({ metodo: titulo, status, detalhe, id_encontrado: id });
        console.log(`👉 [${titulo}]: ${status}`);
    };

    try {
        // 1. TESTE: CPF FORMATADO (Parâmetro cpf_cnpj snake_case)
        await testarMetodo("1. CPF (cpf_cnpj)", { cpf_cnpj: cpfFormatado });

        // 2. TESTE: CPF FORMATADO (Parâmetro cpfCnpj camelCase)
        await testarMetodo("2. CPF (cpfCnpj)", { cpfCnpj: cpfFormatado });

        // 3. TESTE: PESQUISA GERAL (CPF)
        await testarMetodo("3. Pesquisa Geral (CPF)", { pesquisa: cpfFormatado });

        // 4. TESTE: BUSCA POR NOME (A ESTRATÉGIA "PENEIRA")
        // Aqui buscamos pelo nome e o código tenta achar o CPF dentro
        await testarMetodo(`4. Busca por Nome (${nomeTeste})`, { pesquisa: nomeTeste });

        res.json({
            alvo: { cpf: cpfFormatado, nome_pesquisado: nomeTeste },
            resultados: resultados
        });

    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});