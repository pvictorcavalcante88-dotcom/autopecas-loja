const API_URL = ''; // Deixe vazio se estiver no mesmo domínio

// ============================================================
// INICIALIZAÇÃO E DATAS
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    verificarLogin();
    
    // CONFIGURAÇÃO DAS DATAS PADRÃO (Primeiro dia do mês -> Hoje)
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    
    const hojeStr = hoje.toISOString().split('T')[0];
    const primeiroDiaStr = primeiroDia.toISOString().split('T')[0];

    // 1. Datas do Widget de Lucro (Topo)
    const elInicio = document.getElementById('data-inicio');
    const elFim = document.getElementById('data-fim');
    if(elInicio) elInicio.value = primeiroDiaStr;
    if(elFim) elFim.value = hojeStr;

    // 2. Datas do Filtro da Tabela (Histórico Completo)
    const filtroInicio = document.getElementById('filtro-inicio');
    const filtroFim = document.getElementById('filtro-fim');
    if(filtroInicio) filtroInicio.value = primeiroDiaStr;
    if(filtroFim) filtroFim.value = hojeStr;
});

let AFILIADO_TOKEN = null;
window.TODAS_VENDAS = []; // 🟢 VARIÁVEL GLOBAL IMPORTANTÍSSIMA

function verificarLogin() {
    // Tenta pegar o login
    const dadosAntigos = localStorage.getItem('afiliadoLogado');
    const tokenSimples = localStorage.getItem('afiliadoToken');

    if (dadosAntigos) {
        const dados = JSON.parse(dadosAntigos);
        AFILIADO_TOKEN = dados.token;
    } else if (tokenSimples) {
        AFILIADO_TOKEN = tokenSimples;
    } else {
        // Se não tiver token, manda pro login
        // (Remova o alert se quiser que redirecione silenciosamente)
        // alert("Sessão expirada. Faça login novamente.");
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

    // CARREGA TUDO
    carregarDashboardCompleto();
    carregarMeusOrcamentos();
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

        // 🟢 1. GUARDA AS VENDAS NA VARIÁVEL GLOBAL
        window.TODAS_VENDAS = dados.vendas || [];
        
        // 2. Preenche Topo (Nome e Saldo)
        const elNome = document.getElementById('nome-afiliado');
        if(elNome) elNome.innerText = `Olá, ${dados.nome}!`;

        const elSaldo = document.getElementById('saldo-total');
        if(elSaldo) elSaldo.innerText = parseFloat(dados.saldo).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

        const elQtd = document.getElementById('qtd-vendas');
        if(elQtd && dados.vendas) {
            const aprovadas = dados.vendas.filter(v => v.status === 'APROVADO' || v.status === 'ENTREGUE').length;
            elQtd.innerText = aprovadas;
        }

        const elLink = document.getElementById('link-afiliado');
        if(elLink && dados.codigo) {
            elLink.value = `${window.location.origin}/index.html?ref=${dados.codigo}`;
        }

        // 3. ATUALIZA DADOS BANCÁRIOS NA TELA DE PERFIL
        if(document.getElementById('input-pix')) document.getElementById('input-pix').value = dados.chavePix || '';
        if(document.getElementById('input-banco')) document.getElementById('input-banco').value = dados.banco || '';
        if(document.getElementById('input-agencia')) document.getElementById('input-agencia').value = dados.agencia || '';
        if(document.getElementById('input-conta')) document.getElementById('input-conta').value = dados.conta || '';

        // 4. PREENCHE AS TABELAS INICIAIS
        calcularVendasPorPeriodo(); // Widget do topo
        preencherTabelaVendas('lista-ultimas-vendas', dados.vendas.slice(0, 5)); // 5 últimas
        preencherTabelaVendas('lista-todas-vendas', dados.vendas); // Tabela completa

    } catch (error) {
        console.error("Erro Fatal:", error);
    }
}

// ============================================================
// 🟢 NOVAS FUNÇÕES DE FILTRO (TABELA COMPLETA)
// ============================================================

function filtrarHistoricoVendas() {
    const inicioVal = document.getElementById('filtro-inicio').value;
    const fimVal = document.getElementById('filtro-fim').value;

    if (!inicioVal || !fimVal) {
        alert("Selecione as datas para filtrar.");
        return;
    }

    // Cria datas ajustadas para comparar corretamente
    const dataInicio = new Date(inicioVal);
    dataInicio.setHours(0,0,0,0);
    
    const dataFim = new Date(fimVal);
    dataFim.setHours(23,59,59,999);

    if (window.TODAS_VENDAS.length > 0) {
        const filtradas = window.TODAS_VENDAS.filter(v => {
            const dataVenda = new Date(v.createdAt);
            // Compara se está entre as datas (INCLUI todos os status)
            return dataVenda >= dataInicio && dataVenda <= dataFim;
        });

        preencherTabelaVendas('lista-todas-vendas', filtradas);
    } else {
        preencherTabelaVendas('lista-todas-vendas', []);
    }
}

function limparFiltroVendas() {
    // Reseta inputs
    document.getElementById('filtro-inicio').value = '';
    document.getElementById('filtro-fim').value = '';
    
    // Restaura a lista completa
    preencherTabelaVendas('lista-todas-vendas', window.TODAS_VENDAS);
}

// ============================================================
// CÁLCULO DO WIDGET (TOPO) - Apenas Aprovados/Entregues
// ============================================================
function calcularVendasPorPeriodo() {
    const elInicio = document.getElementById('data-inicio');
    const elFim = document.getElementById('data-fim');
    const elTotal = document.getElementById('total-periodo-valor');
    
    if(!elInicio || !elFim || !elTotal) return;

    const inicioStr = elInicio.value; 
    const fimStr = elFim.value;

    if (!inicioStr || !fimStr) return;

    let totalPeriodo = 0;

    if (window.TODAS_VENDAS) {
        window.TODAS_VENDAS.forEach(v => {
            // Regra de Negócio: Só soma no widget se tiver ganhado comissão (Aprovado)
            if (v.status === 'APROVADO' || v.status === 'ENTREGUE') {
                const dataVendaStr = new Date(v.createdAt).toISOString().split('T')[0];
                if (dataVendaStr >= inicioStr && dataVendaStr <= fimStr) {
                    // Soma a COMISSÃO ou o VALOR TOTAL? 
                    // Geralmente afiliado quer ver quanto VENDEU no total, ou sua COMISSÃO.
                    // Abaixo soma o valor total da venda:
                    totalPeriodo += parseFloat(v.valorTotal || 0);
                }
            }
        });
    }

    elTotal.innerText = totalPeriodo.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
}

// ============================================================
// RENDERIZAÇÃO DE TABELAS (GENÉRICA)
// ============================================================
function preencherTabelaVendas(elementId, vendas) {
    const tbody = document.getElementById(elementId);
    if(!tbody) return;

    tbody.innerHTML = ''; 

    if (!vendas || vendas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#999;">Nenhuma venda neste período.</td></tr>';
        return;
    }

    vendas.forEach(v => {
        const data = new Date(v.createdAt).toLocaleDateString('pt-BR');
        const valor = parseFloat(v.valorTotal).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        const comissao = parseFloat(v.comissaoGerada || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
        
        let statusStyle = "background:#eee; color:#333;";
        if(v.status === 'APROVADO') statusStyle = "background:#d4edda; color:#155724;";
        if(v.status === 'ENTREGUE') statusStyle = "background:#d4edda; color:#155724;";
        if(v.status === 'PENDENTE') statusStyle = "background:#fff3cd; color:#856404;";
        if(v.status === 'CANCELADO') statusStyle = "background:#f8d7da; color:#721c24;";
        if(v.status === 'PAGO') statusStyle = "background:#cce5ff; color:#004085;";

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
// ORÇAMENTOS, CLIENTES, PERFIL E SAQUES (MANTIDOS IGUAIS)
// ============================================================

async function carregarMeusOrcamentos() {
    const tbody = document.getElementById('lista-orcamentos-salvos');
    if(!tbody) return;
    try {
        const res = await fetch(`${API_URL}/afiliado/orcamentos`, {
            headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        const lista = await res.json();
        tbody.innerHTML = '';
        if (!lista || lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#7f8c8d;">Nenhum orçamento salvo.</td></tr>';
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
                    <button onclick="restaurarOrcamento('${encodeURIComponent(orc.itens)}')" style="background:#3498db; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin-right:5px;" title="Carregar no Carrinho">
                        <i class="ph ph-shopping-cart"></i>
                    </button>
                    <button onclick="excluirOrcamento(${orc.id})" style="background:#c0392b; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" title="Excluir">
                        <i class="ph ph-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { console.error(e); }
}

function restaurarOrcamento(itensEncoded) {
    if(!confirm("Isso vai substituir o carrinho atual pelo deste orçamento. Continuar?")) return;
    try {
        const itensString = decodeURIComponent(itensEncoded);
        JSON.parse(itensString);
        localStorage.setItem('nossoCarrinho', itensString);
        window.location.href = 'cart.html'; 
    } catch(e) { alert("Erro ao carregar itens."); }
}

async function excluirOrcamento(id) {
    if(!confirm("Deseja excluir este orçamento?")) return;
    try {
        await fetch(`${API_URL}/orcamentos/${id}`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        carregarMeusOrcamentos();
    } catch(e) { alert("Erro ao excluir"); }
}

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
            tbody.innerHTML = '<tr><td colspan="5" align="center" style="padding:20px;">Nenhum cliente ainda.</td></tr>';
            return;
        }
        clientes.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${c.nome}</strong></td>
                <td>${c.email}<br>${c.telefone ? `<small>📞 ${c.telefone}</small>` : ''}</td>
                <td>${parseFloat(c.totalGasto).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td>
                <td>${new Date(c.ultimaCompra).toLocaleDateString('pt-BR')}</td>
                <td>
                    <a href="https://wa.me/?text=Olá ${c.nome}, tudo bem?" target="_blank" style="color:#27ae60; text-decoration:none; font-weight:bold;">
                        <i class="ph ph-whatsapp-logo"></i>
                    </a>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) { console.error(e); }
}

async function carregarMeusSaques() {
    const tbody = document.getElementById('lista-saques');
    if(!tbody) return;
    try {
        const res = await fetch(`${API_URL}/afiliado/saques`, { headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` } });
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
            
            let statusBadge = `<span style="background:#fff3cd; color:#856404; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:0.7rem;">PENDENTE ⏳</span>`;
            if(s.status === 'PAGO') statusBadge = `<span style="background:#d4edda; color:#155724; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:0.7rem;">PAGO ✅</span>`;

            let btnComprovante = '-';
            if (s.comprovante) {
                const link = s.comprovante.replace(/\\/g, '/');
                btnComprovante = `<a href="${API_URL}/${link}" target="_blank" style="background:#3498db; color:white; padding:4px 8px; border-radius:4px; text-decoration:none; font-size:0.8rem;"><i class="ph ph-file-text"></i> Ver</a>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${dataSol}</td><td><strong>${valor}</strong></td><td>${dataPag}</td><td>${statusBadge}</td><td>${btnComprovante}</td>`;
            tbody.appendChild(tr);
        });
    } catch(e) { console.error(e); }
}

async function solicitarSaque() {
    if(!confirm("Deseja solicitar o saque de todo o saldo disponível?")) return;
    const btn = document.getElementById('btn-saque'); 
    if(btn) btn.innerText = "Processando...";
    try {
        const res = await fetch(`${API_URL}/afiliado/saque`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` }
        });
        const data = await res.json();
        if (res.ok) {
            alert("✅ Solicitação Enviada! Valor: R$ " + parseFloat(data.valor).toFixed(2));
            carregarDashboardCompleto();
        } else {
            alert("Atenção: " + (data.erro || "Falha ao solicitar."));
        }
    } catch (e) { alert("Erro de conexão."); } 
    finally { if(btn) btn.innerText = "Solicitar Saque"; }
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

function mudarAba(abaId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));
    const tab = document.getElementById(abaId);
    const nav = document.getElementById('nav-' + abaId);
    if(tab) tab.classList.add('active');
    if(nav) nav.classList.add('active');
}

// SISTEMA DE NOTIFICAÇÕES (IGUAL)
function iniciarNotificacoes() { verificarNotificacoes(); setInterval(verificarNotificacoes, 15000); }
async function verificarNotificacoes() {
    if(!AFILIADO_TOKEN) return;
    try {
        const res = await fetch(`${API_URL}/afiliado/notificacoes`, { headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` } });
        if(!res.ok) return;
        const dados = await res.json();
        const total = dados.mensagens.length + dados.vendas.length;
        const badge = document.getElementById('notif-badge');
        const lista = document.getElementById('notif-list');
        if(badge) { badge.style.display = total > 0 ? 'block' : 'none'; badge.innerText = total > 9 ? '9+' : total; }
        if(!lista) return;
        lista.innerHTML = '';
        if(total === 0) { lista.innerHTML = '<div style="padding:15px; text-align:center; color:#999; font-size:0.9rem;">Sem novidades. 💤</div>'; return; }
        
        dados.vendas.forEach(v => {
            lista.innerHTML += `<div class="notif-item" style="border-left: 4px solid #27ae60;"><i class="ph ph-currency-circle-dollar" style="color:#27ae60;"></i><div><strong>Venda!</strong><br>${parseFloat(v.valorTotal).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div></div>`;
        });
        dados.mensagens.forEach(m => {
            lista.innerHTML += `<div class="notif-item" style="border-left: 4px solid #3498db;"><i class="ph ph-chat-centered-text" style="color:#3498db;"></i><div><strong>Admin:</strong><br>${m.texto}</div></div>`;
        });
    } catch(e) { console.error("Erro sino", e); }
}
function abrirNotificacoes() {
    const d = document.getElementById('notif-dropdown');
    if(d) { d.style.display = d.style.display === 'block' ? 'none' : 'block'; if(d.style.display==='block') marcarLidas(); }
}
async function marcarLidas() {
    if(!AFILIADO_TOKEN) return;
    fetch(`${API_URL}/afiliado/notificacoes/ler`, { method: 'POST', headers: { 'Authorization': `Bearer ${AFILIADO_TOKEN}` } });
    const b = document.getElementById('notif-badge'); if(b) b.style.display = 'none';
}
window.addEventListener('click', (e) => {
    const c = document.getElementById('box-sino');
    const d = document.getElementById('notif-dropdown');
    if (c && d && !c.contains(e.target)) d.style.display = 'none';
});