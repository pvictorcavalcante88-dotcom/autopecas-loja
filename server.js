const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

const SECRET_KEY = "SEGREDO_SUPER_SECRETO"; // Em produção, use variável de ambiente

// =================================================================
// 🛡️ MIDDLEWARE DE SEGURANÇA (A função que faltava!)
// =================================================================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato: "Bearer TOKEN"

    if (!token) return res.sendStatus(401); // Sem token

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403); // Token inválido
        req.user = user; // Salva os dados do usuário na requisição
        next();
    });
}

// =================================================================
// 🔑 ROTAS DE LOGIN (ADMIN E AFILIADO)
// =================================================================

// Login Admin
app.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    if (email === "admin@autopecas.com" && senha === "admin123") {
        const token = jwt.sign({ role: 'admin' }, SECRET_KEY, { expiresIn: '12h' });
        return res.json({ token });
    }
    res.status(401).json({ erro: "Credenciais inválidas" });
});

// Login Afiliado
app.post('/afiliado/login', async (req, res) => {
    const { telefone, senha } = req.body;
    try {
        const afiliado = await prisma.afiliado.findUnique({ where: { telefone } });
        if (!afiliado) return res.status(404).json({ erro: "Afiliado não encontrado" });
        
        if (afiliado.senha !== senha) return res.status(401).json({ erro: "Senha incorreta" });
        if (!afiliado.aprovado) return res.status(403).json({ erro: "Cadastro pendente de aprovação" });

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

// =================================================================
// 🔎 ROTA DE BUSCA INTELIGENTE (Quebra palavras)
// =================================================================
app.get('/search', async (req, res) => {
    try {
        const { q, categoria } = req.query;
        let whereClause = {};
        let condicoesAnd = [];

        if (categoria) {
            condicoesAnd.push({ categoria: { contains: categoria } });
        }

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
                        { categoria: { contains: termo } }
                    ]
                });
            });
        }

        if (condicoesAnd.length > 0) {
            whereClause.AND = condicoesAnd;
        }

        console.log("🔍 Buscando:", JSON.stringify(whereClause));

        const produtos = await prisma.produto.findMany({
            where: whereClause,
            take: 50
        });

        res.json(produtos);

    } catch (error) {
        console.error("❌ Erro na busca:", error);
        res.json([]); 
    }
});

// =================================================================
// 📂 ROTAS DE ORÇAMENTOS (SALVAR E LISTAR)
// =================================================================

// 1. Salvar um novo orçamento (Usa o authenticateToken)
app.post('/orcamentos', authenticateToken, async (req, res) => {
    try {
        const { nome, itens, total } = req.body;
        const afiliadoId = req.user.id; // Pega do token decodificado

        const novo = await prisma.orcamento.create({
            data: {
                nome,
                itens: JSON.stringify(itens),
                total: parseFloat(total),
                afiliadoId
            }
        });

        res.json({ mensagem: "Orçamento salvo!", id: novo.id });
    } catch (e) {
        console.error(e);
        res.status(500).json({ erro: "Erro ao salvar orçamento." });
    }
});

// 2. Listar orçamentos do afiliado logado
app.get('/afiliado/orcamentos', authenticateToken, async (req, res) => {
    try {
        const afiliadoId = req.user.id;
        const orcamentos = await prisma.orcamento.findMany({
            where: { afiliadoId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(orcamentos);
    } catch (e) {
        res.status(500).json({ erro: "Erro ao buscar orçamentos." });
    }
});

// 3. Excluir orçamento
app.delete('/orcamentos/:id', authenticateToken, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const afiliadoId = req.user.id;
        
        await prisma.orcamento.deleteMany({
            where: { id, afiliadoId }
        });

        res.json({ mensagem: "Deletado com sucesso" });
    } catch (e) {
        res.status(500).json({ erro: "Erro ao deletar." });
    }
});

// =================================================================
// 📦 ROTAS DE PRODUTOS (CRUD BÁSICO)
// =================================================================
app.get('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const produto = await prisma.produto.findUnique({ where: { id: parseInt(id) } });
        if (produto) res.json(produto);
        else res.status(404).json({ error: "Produto não encontrado" });
    } catch (e) { res.status(500).json({ error: "Erro" }); }
});

// Admin: Criar/Editar Produtos
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
        const { id } = req.params;
        const p = await prisma.produto.update({ where: { id: parseInt(id) }, data: req.body });
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

// =================================================================
// 🦊 ROTAS DE AFILIADO (DASHBOARD E CONFIG)
// =================================================================
app.put('/afiliado/config', authenticateToken, async (req, res) => {
    try {
        const { novaMargem } = req.body;
        await prisma.afiliado.update({
            where: { id: req.user.id },
            data: { margem: parseFloat(novaMargem) }
        });
        res.json({ success: true });
    } catch(e) { res.status(500).json({ erro: "Erro ao atualizar margem" }); }
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

// =================================================================
// 🛒 FINALIZAR PEDIDO
// =================================================================
app.post('/finalizar-pedido', async (req, res) => {
    try {
        const { cliente, itens, afiliadoCodigo } = req.body;
        let valorTotal = 0;
        let itensTexto = "";

        // Calcula total (simplificado, ideal seria revalidar preços no banco)
        itens.forEach(i => {
            valorTotal += (i.unitario * i.qtd); // Usa o unitario que veio do front (com margem)
            itensTexto += `${i.qtd}x ${i.nome} (R$ ${i.unitario.toFixed(2)}) | `;
        });

        let dadosPedido = {
            clienteNome: cliente.nome,
            clienteEmail: cliente.email,
            clienteEndereco: cliente.endereco,
            valorTotal: valorTotal,
            itens: itensTexto
        };

        // Se tiver afiliado, vincula e calcula comissão
        if (afiliadoCodigo) {
            const afiliado = await prisma.afiliado.findUnique({ where: { codigo: afiliadoCodigo } });
            if (afiliado) {
                dadosPedido.afiliadoId = afiliado.id;
                // Exemplo simples: 5% de comissão sobre o total vendido
                dadosPedido.comissaoGerada = valorTotal * 0.05; 
                
                // Atualiza saldo do afiliado
                await prisma.afiliado.update({
                    where: { id: afiliado.id },
                    data: { saldo: { increment: dadosPedido.comissaoGerada } }
                });
            }
        }

        const pedido = await prisma.pedido.create({ data: dadosPedido });
        res.json(pedido);

    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: "Erro ao processar pedido" });
    }
});

// Rota padrão para teste
app.get('/', (req, res) => {
    res.send('API AutoPeças Veloz Rodando 🚀');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});