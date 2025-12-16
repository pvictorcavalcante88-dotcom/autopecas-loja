const API_URL = ''; // Deixe vazio se estiver no mesmo domínio

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    verificarLogin();
});

let AFILIADO_TOKEN = null;

function verificarLogin() {
    // Tenta pegar o login (antigo ou novo)
    const dadosAntigos = localStorage.getItem('afiliadoLogado');
    const tokenSimples = localStorage.getItem('afiliadoToken');

    if (dadosAntigos) {
        const dados = JSON.parse(dadosAntigos);
        AFILIADO_TOKEN = dados.token;
    } else if (tokenSimples) {
        AFILIADO_TOKEN = tokenSimples;
    } else {
        alert("Sessão expirada. Faça login novamente.");
        window.location.href = 'index.html';
        return;
    }

    // Configura Botão Sair
    const btnSair = document.getElementById('logout-btn') || document.querySelector('.btn-sair');
    if(btnSair) {
        btnSair.onclick = (e) => {
            e.preventDefault();
            localStorage.removeItem('afiliadoLogado');
            localStorage.removeItem('afiliadoToken');
            window.location.href = 'index.html';
        }
    }

    // CARREGA TUDO DE UMA VEZ
    carregarDashboardCompleto();
    carregarMeusOrcamentos();
    // A lista de clientes é carregada quando clica na aba, mas vamos carregar logo pra garantir
    carregarMeusClientes();
    carregarMeusSaques();
    iniciarNotificacoes();
}

// ============================================================
// 1. CARREGAR DADOS DO DASHBOARD E VENDAS
// ============================================================
async function carregarDashboardCompleto() {
    try {
        const res = await fetch(`${API_URL}/afiliado/dashboard`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });

        if (!res.ok) throw new Error("Erro ao buscar dados");

        const dados = await res.json();

        // 1. Preenche Topo (Nome, Saldo, Link)
        const elNome = document.getElementById('nome-afiliado');
        if(elNome) elNome.innerText = `Olá, ${dados.nome}!`;

        const elSaldo = document.getElementById('saldo-total');
        if(elSaldo) elSaldo.innerText = parseFloat(dados.saldo).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

        const elQtd = document.getElementById('qtd-vendas');
        if(elQtd && dados.vendas) {
            // Conta apenas as aprovadas
            const aprovadas = dados.vendas.filter(v => v.status === 'APROVADO').length;
            elQtd.innerText = aprovadas;
        }

        const elLink = document.getElementById('link-afiliado');
        if(elLink && dados.codigo) {
            elLink.value = `${window.location.origin}/index.html?ref=${dados.codigo}`;
        }

        // 2. PREENCHE AS TABELAS DE VENDAS (O PULO DO GATO 🐱)
        // Aqui preenchemos EXPLICITAMENTE as duas tabelas separadas
        
        // Tabela 1: Resumo (Visão Geral) - Só as 5 últimas
        preencherTabelaVendas('lista-ultimas-vendas', dados.vendas.slice(0, 5));
        
        // Tabela 2: Completa (Aba Vendas) - Todas
        preencherTabelaVendas('lista-todas-vendas', dados.vendas);

        // 3. Preenche Dados Bancários nos inputs
        if(document.getElementById('input-pix')) document.getElementById('input-pix').value = dados.chavePix || '';

    } catch (error) {
        console.error("Erro Fatal:", error);
    }
}

// Função auxiliar para desenhar tabelas de vendas
function preencherTabelaVendas(elementId, vendas) {
    const tbody = document.getElementById(elementId);
    if(!tbody) return; // Se a tabela não existir na tela, ignora

    tbody.innerHTML = ''; // Limpa o "Carregando..."

    if (!vendas || vendas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Nenhuma venda encontrada.</td></tr>';
        return;
    }

    vendas.forEach(v => {
        const data = new Date(v.createdAt).toLocaleDateString('pt-BR');
        const valor = parseFloat(v.valorTotal).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        const comissao = parseFloat(v.comissaoGerada || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        
        let statusStyle = "background:#eee; color:#333;";
        if(v.status === 'APROVADO') statusStyle = "background:#d4edda; color:#155724;";
        if(v.status === 'PENDENTE') statusStyle = "background:#fff3cd; color:#856404;";
        if(v.status === 'CANCELADO') statusStyle = "background:#f8d7da; color:#721c24;";

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${data}</td>
            <td>${v.clienteNome || 'Cliente'}</td>
            <td>${valor}</td>
            <td><span style="color:#27ae60; font-weight:bold;">+ ${comissao}</span></td>
            <td><span style="padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold; ${statusStyle}">${v.status || 'PENDENTE'}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ============================================================
// 2. CARREGAR MEUS ORÇAMENTOS
// ============================================================
async function carregarMeusOrcamentos() {
    const tbody = document.getElementById('lista-orcamentos-salvos');
    if(!tbody) return;

    try {
        const res = await fetch(`${API_URL}/afiliado/orcamentos`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        const lista = await res.json();

        tbody.innerHTML = ''; // Limpa o carregando

        if (!lista || lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#7f8c8d;">Nenhum orçamento salvo ainda.</td></tr>';
            return;
        }

        lista.forEach(orc => {
            const data = new Date(orc.createdAt).toLocaleDateString('pt-BR');
            const totalDisplay = orc.total > 0 ? parseFloat(orc.total).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}) : "Sob Consulta";
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${orc.nome}</strong></td>
                <td>${data}</td>
                <td style="color:#27ae60;">${totalDisplay}</td>
                <td>
                    <button onclick="restaurarOrcamento('${encodeURIComponent(orc.itens)}')" style="background:#3498db; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin-right:5px;">
                        <i class="ph ph-shopping-cart"></i> Abrir
                    </button>
                    <button onclick="excluirOrcamento(${orc.id})" style="background:#c0392b; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">
                        <i class="ph ph-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error("Erro orçamentos:", e);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Erro ao carregar orçamentos.</td></tr>';
    }
}

// ATUALIZE ESTA FUNÇÃO NO SEU ARQUIVO afiliado.js

function restaurarOrcamento(itensEncoded) {
    if(!confirm("Isso vai substituir o carrinho atual pelo deste orçamento. Continuar?")) return;

    try {
        // 1. Decodifica os dados que vieram do banco
        const itensString = decodeURIComponent(itensEncoded);

        // 2. Verifica se é um JSON válido (só pra garantir)
        JSON.parse(itensString);

        // 3. Salva DIRETAMENTE no navegador (LocalStorage)
        // Assim, quando a página carregar, os itens já estarão lá.
        localStorage.setItem('nossoCarrinho', itensString);

        // 4. Redireciona direto para o CARRINHO
        window.location.href = 'cart.html'; 

    } catch(e) {
        console.error("Erro ao restaurar:", e);
        alert("Erro ao processar os itens deste orçamento.");
    }
}

async function excluirOrcamento(id) {
    if(!confirm("Deseja excluir este orçamento?")) return;
    try {
        await fetch(`${API_URL}/orcamentos/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        carregarMeusOrcamentos(); // Recarrega a lista
    } catch(e) { alert("Erro ao excluir"); }
}

// ============================================================
// 3. CARREGAR MEUS CLIENTES
// ============================================================
async function carregarMeusClientes() {
    const tbody = document.getElementById('lista-clientes');
    if(!tbody) return;

    try {
        const res = await fetch(`${API_URL}/afiliado/meus-clientes`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        const clientes = await res.json();

        tbody.innerHTML = '';

        if (!clientes || clientes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" align="center" style="padding:20px;">Nenhum cliente na sua carteira ainda.</td></tr>';
            return;
        }

        clientes.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${c.nome}</strong></td>
                <td>
                    ${c.email}<br>
                    ${c.telefone ? `<small>📞 ${c.telefone}</small>` : ''}
                </td>
                <td>${parseFloat(c.totalGasto).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td>
                <td>${new Date(c.ultimaCompra).toLocaleDateString('pt-BR')}</td>
                <td>
                    <a href="https://wa.me/?text=Olá ${c.nome}, tudo bem?" target="_blank" style="color:#27ae60; text-decoration:none; font-weight:bold;">
                        <i class="ph ph-whatsapp-logo"></i> Contatar
                    </a>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch(e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" align="center" style="color:red">Erro ao buscar clientes.</td></tr>';
    }
}

// ============================================================
// UTILITÁRIOS E NAVEGAÇÃO
// ============================================================
function mudarAba(abaId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));

    const tab = document.getElementById(abaId);
    const nav = document.getElementById('nav-' + abaId);

    if(tab) tab.classList.add('active');
    if(nav) nav.classList.add('active');
}

async function salvarDadosBancarios() {
    const dados = {
        chavePix: document.getElementById('input-pix').value,
        banco: document.getElementById('input-banco').value,
        agencia: document.getElementById('input-agencia').value,
        conta: document.getElementById('input-conta').value
    };
    try {
        const res = await fetch(`${API_URL}/afiliado/perfil`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AFILIADO_TOKEN}` },
            body: JSON.stringify(dados)
        });
        if(res.ok) alert("✅ Dados salvos!");
        else alert("Erro ao salvar.");
    } catch(e) { alert("Erro de conexão."); }
}

function iniciarNotificacoes() {
    // Lógica simples para mostrar badge se tiver algo (opcional)
    setInterval(async () => {
        try {
            const res = await fetch(`${API_URL}/afiliado/notificacoes`, {
                headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
            });
            const dados = await res.json();
            const total = dados.mensagens.length + dados.vendas.length;
            const badge = document.querySelector('.badge-dot');
            if(badge) badge.style.display = total > 0 ? 'block' : 'none';
        } catch(e) {}
    }, 30000);
}

// ============================================================
// FUNÇÃO DE SOLICITAR SAQUE
// ============================================================
async function solicitarSaque() {
    // 1. Confirmação
    if(!confirm("Deseja solicitar o saque de todo o saldo disponível?")) return;

    // 2. Efeito Visual (Pega o botão pelo ID novo)
    const btn = document.getElementById('btn-saque'); 
    const textoOriginal = btn ? btn.innerText : "Solicitar Saque";
    
    if(btn) {
        btn.innerText = "Processando...";
        btn.disabled = true; // Impede clicar 2 vezes
        btn.style.opacity = "0.7";
    }

    try {
        // 3. Chama o servidor
        const res = await fetch(`${API_URL}/afiliado/saque`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });

        const data = await res.json();

        if (res.ok) {
            // SUCESSO
            alert(
                "✅ Solicitação Enviada com Sucesso!\n\n" +
                `Valor Solicitado: R$ ${parseFloat(data.valor).toFixed(2)}\n\n` +
                "🕒 O pagamento será realizado em até 3 dias úteis."
            );
            
            // Recarrega a tela para zerar o saldo
            carregarDashboardCompleto();
        } else {
            // ERRO (Ex: Saldo zero)
            alert("Atenção: " + (data.erro || "Falha ao solicitar."));
        }

    } catch (e) {
        alert("Erro de conexão com o servidor.");
        console.error(e);
    } finally {
        // 4. Volta o botão ao normal
        if(btn) {
            btn.innerText = textoOriginal;
            btn.disabled = false;
            btn.style.opacity = "1";
        }
    }
}

// ============================================================
// 4. CARREGAR MEUS SAQUES (COM BOTÃO DE COMPROVANTE)
// ============================================================
async function carregarMeusSaques() {
    const tbody = document.getElementById('lista-saques');
    if(!tbody) return;

    try {
        const res = await fetch(`${API_URL}/afiliado/saques`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        const saques = await res.json();

        tbody.innerHTML = '';

        if (!saques || saques.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" align="center" style="color:#777; padding:15px;">Nenhum saque solicitado.</td></tr>';
            return;
        }

        saques.forEach(s => {
            const dataSol = new Date(s.dataSolicitacao).toLocaleDateString('pt-BR');
            const dataPag = s.dataPagamento ? new Date(s.dataPagamento).toLocaleDateString('pt-BR') : '-';
            const valor = parseFloat(s.valor).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
            
            // Status Badge
            let statusBadge = `<span style="background:#fff3cd; color:#856404; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:0.7rem;">PENDENTE ⏳</span>`;
            if(s.status === 'PAGO') {
                statusBadge = `<span style="background:#d4edda; color:#155724; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:0.7rem;">PAGO ✅</span>`;
            }

            // Botão Comprovante
            let btnComprovante = '-';
            if (s.comprovante) {
                // Corrige barras invertidas do Windows se houver
                const link = s.comprovante.replace(/\\/g, '/');
                btnComprovante = `
                    <a href="${API_URL}/${link}" target="_blank" style="background:#3498db; color:white; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:0.8rem; display:inline-flex; align-items:center; gap:3px;">
                        <i class="ph ph-file-text"></i> Ver
                    </a>
                `;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${dataSol}</td>
                <td><strong>${valor}</strong></td>
                <td>${dataPag}</td>
                <td>${statusBadge}</td>
                <td>${btnComprovante}</td> 
            `;
            tbody.appendChild(tr);
        });

    } catch(e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" align="center" style="color:red">Erro ao carregar saques.</td></tr>';
    }
}