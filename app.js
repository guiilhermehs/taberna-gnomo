import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Configuração do seu projeto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAvWcw8LU48UQXG1MafplwYRiuskAAweX4",
  authDomain: "taberna-do-gnomo-estoque.firebaseapp.com",
  projectId: "taberna-do-gnomo-estoque",
  storageBucket: "taberna-do-gnomo-estoque.firebasestorage.app",
  messagingSenderId: "189568271099",
  appId: "1:189568271099:web:9104b0ba4a7816d192265e",
  measurementId: "G-BVKMWHHPZV"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Estado global em tempo real
let produtos = [];
let vendas = [];
let entradas = [];
let despesas = [];
let carrinho = [];

// Utilitários
const formatBRL = (val) =>
  Number(val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDate = (ts) => {
  if (!ts) return "-";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const calcLucro = (custo, venda) => {
  if (!custo || custo <= 0) return 0;
  return (((venda - custo) / custo) * 100).toFixed(1);
};

// ================= AUTENTICAÇÃO =================
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginError = document.getElementById("login-error");

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("login-email").value.trim();
  const pass = document.getElementById("login-password").value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    loginError.textContent = "E-mail ou senha inválidos.";
  }
});

document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    document.getElementById("user-badge").textContent = user.email;
    iniciarListeners();
  } else {
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
  }
});

// ================= NAVEGAÇÃO ENTRE ABAS =================
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.remove("hidden");
  });
});

// ================= LISTENERS EM TEMPO REAL =================
let listenersAtivos = false;
function iniciarListeners() {
  if (listenersAtivos) return;
  listenersAtivos = true;

  // 1. Produtos
  onSnapshot(query(collection(db, "produtos"), orderBy("nome")), (snap) => {
    produtos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderProdutos();
    atualizarSelectsProdutos();
    atualizarKPIs();
  });

  // 2. Vendas
  onSnapshot(query(collection(db, "vendas"), orderBy("criadoEm", "desc")), (snap) => {
    vendas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderVendas();
    atualizarKPIs();
  });

  // 3. Entradas
  onSnapshot(query(collection(db, "entradas"), orderBy("criadoEm", "desc")), (snap) => {
    entradas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderEntradas();
  });

  // 4. Despesas
  onSnapshot(query(collection(db, "despesas"), orderBy("criadoEm", "desc")), (snap) => {
    despesas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderDespesas();
    atualizarKPIs();
  });
}

// ================= 1. CRUD PRODUTOS =================
const modalProduto = document.getElementById("modal-produto");
const formProduto = document.getElementById("form-produto");

const inputCusto = document.getElementById("prod-custo");
const inputVenda = document.getElementById("prod-venda");
const inputLucro = document.getElementById("prod-lucro");

function atualizarCampoLucro() {
  const c = parseFloat(inputCusto.value) || 0;
  const v = parseFloat(inputVenda.value) || 0;
  inputLucro.value = `${calcLucro(c, v)}%`;
}
inputCusto.addEventListener("input", atualizarCampoLucro);
inputVenda.addEventListener("input", atualizarCampoLucro);

document.getElementById("btn-novo-produto").addEventListener("click", () => {
  formProduto.reset();
  document.getElementById("prod-id").value = "";
  document.getElementById("modal-titulo").textContent = "Cadastrar Produto";
  inputLucro.value = "0%";
  modalProduto.classList.remove("hidden");
});

const fecharModal = () => modalProduto.classList.add("hidden");
document.getElementById("btn-fechar-modal").addEventListener("click", fecharModal);
document.getElementById("btn-cancelar-modal").addEventListener("click", fecharModal);

formProduto.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("prod-id").value;
  const custo = parseFloat(inputCusto.value);
  const venda = parseFloat(inputVenda.value);

  const payload = {
    cod: document.getElementById("prod-cod").value.trim(),
    categoria: document.getElementById("prod-categoria").value,
    nome: document.getElementById("prod-nome").value.trim(),
    precoCusto: custo,
    precoVenda: venda,
    lucroPercentual: parseFloat(calcLucro(custo, venda)),
    quantidade: parseInt(document.getElementById("prod-qtd").value, 10),
    estoqueMinimo: parseInt(document.getElementById("prod-minimo").value, 10),
    dadosFiscais: {
      ncm: document.getElementById("prod-ncm").value.trim(),
      cfop: document.getElementById("prod-cfop").value.trim()
    },
    atualizadoEm: serverTimestamp()
  };

  if (id) {
    await updateDoc(doc(db, "produtos", id), payload);
  } else {
    payload.criadoEm = serverTimestamp();
    await addDoc(collection(db, "produtos"), payload);
  }
  fecharModal();
});

function renderProdutos() {
  const tbody = document.getElementById("lista-produtos");
  const termo = document.getElementById("busca-produto").value.toLowerCase();
  const cat = document.getElementById("filtro-categoria").value;

  const filtrados = produtos.filter((p) => {
    const matchTexto =
      p.nome.toLowerCase().includes(termo) || p.cod.toLowerCase().includes(termo);
    const matchCat = !cat || p.categoria === cat;
    return matchTexto && matchCat;
  });

  tbody.innerHTML = filtrados
    .map((p) => {
      const baixo = p.quantidade <= (p.estoqueMinimo || 0);
      return `
      <tr class="${baixo ? "low-stock" : ""}">
        <td><strong>${p.cod}</strong></td>
        <td>${p.nome}</td>
        <td>${p.categoria || "-"}</td>
        <td>${formatBRL(p.precoCusto)}</td>
        <td><strong>${formatBRL(p.precoVenda)}</strong></td>
        <td>${p.lucroPercentual ?? calcLucro(p.precoCusto, p.precoVenda)}%</td>
        <td>
          <span class="stock-pill ${baixo ? "stock-low" : "stock-ok"}">
            ${p.quantidade} un ${baixo ? "⚠️" : ""}
          </span>
        </td>
        <td>${formatDate(p.atualizadoEm)}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="editarProduto('${p.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deletarProduto('${p.id}', '${p.nome}')">🗑️</button>
        </td>
      </tr>`;
    })
    .join("");
}

document.getElementById("busca-produto").addEventListener("input", renderProdutos);
document.getElementById("filtro-categoria").addEventListener("change", renderProdutos);

window.editarProduto = (id) => {
  const p = produtos.find((item) => item.id === id);
  if (!p) return;
  document.getElementById("prod-id").value = p.id;
  document.getElementById("prod-cod").value = p.cod;
  document.getElementById("prod-categoria").value = p.categoria || "Cervejas";
  document.getElementById("prod-nome").value = p.nome;
  inputCusto.value = p.precoCusto;
  inputVenda.value = p.precoVenda;
  atualizarCampoLucro();
  document.getElementById("prod-qtd").value = p.quantidade;
  document.getElementById("prod-minimo").value = p.estoqueMinimo ?? 6;
  document.getElementById("prod-ncm").value = p.dadosFiscais?.ncm || "";
  document.getElementById("prod-cfop").value = p.dadosFiscais?.cfop || "";
  document.getElementById("modal-titulo").textContent = "Editar Produto";
  modalProduto.classList.remove("hidden");
};

window.deletarProduto = async (id, nome) => {
  if (confirm(`Tem certeza que deseja excluir "${nome}"?`)) {
    await deleteDoc(doc(db, "produtos", id));
  }
};

function atualizarSelectsProdutos() {
  const options = produtos
    .map(
      (p) =>
        `<option value="${p.id}">${p.cod} - ${p.nome} (${formatBRL(p.precoVenda)} | Est: ${p.quantidade})</option>`
    )
    .join("");
  document.getElementById("venda-produto").innerHTML = options;
  document.getElementById("entrada-produto").innerHTML = options;
}

// ================= 2. VENDAS (PDV + BAIXA ATÔMICA) =================
document.getElementById("btn-add-carrinho").addEventListener("click", () => {
  const prodId = document.getElementById("venda-produto").value;
  const qtd = parseInt(document.getElementById("venda-qtd").value, 10);
  const prod = produtos.find((p) => p.id === prodId);
  if (!prod || qtd <= 0) return;

  const existente = carrinho.find((item) => item.id === prodId);
  const qtdTotal = (existente ? existente.qtd : 0) + qtd;

  if (qtdTotal > prod.quantidade) {
    alert(`Estoque insuficiente! Disponível: ${prod.quantidade} un.`);
    return;
  }

  if (existente) {
    existente.qtd = qtdTotal;
  } else {
    carrinho.push({
      id: prod.id,
      cod: prod.cod,
      nome: prod.nome,
      precoUnitario: prod.precoVenda,
      custoUnitario: prod.precoCusto,
      qtd
    });
  }
  renderCarrinho();
});

document.getElementById("venda-desconto").addEventListener("input", renderCarrinho);

function renderCarrinho() {
  const tbody = document.getElementById("carrinho-itens");
  tbody.innerHTML = carrinho
    .map(
      (item, idx) => `
    <tr>
      <td>${item.nome}</td>
      <td>${item.qtd}</td>
      <td>${formatBRL(item.precoUnitario)}</td>
      <td>${formatBRL(item.precoUnitario * item.qtd)}</td>
      <td><button class="btn btn-danger btn-sm" onclick="removerItemCarrinho(${idx})">X</button></td>
    </tr>`
    )
    .join("");

  const subtotal = carrinho.reduce((acc, i) => acc + i.precoUnitario * i.qtd, 0);
  const desconto = parseFloat(document.getElementById("venda-desconto").value) || 0;
  const total = Math.max(0, subtotal - desconto);

  document.getElementById("resumo-subtotal").textContent = formatBRL(subtotal);
  document.getElementById("resumo-desconto").textContent = `- ${formatBRL(desconto)}`;
  document.getElementById("resumo-total").textContent = formatBRL(total);
}

window.removerItemCarrinho = (idx) => {
  carrinho.splice(idx, 1);
  renderCarrinho();
};

document.getElementById("btn-finalizar-venda").addEventListener("click", async () => {
  if (carrinho.length === 0) {
    alert("Adicione pelo menos um item ao pedido.");
    return;
  }

  const subtotal = carrinho.reduce((acc, i) => acc + i.precoUnitario * i.qtd, 0);
  const desconto = parseFloat(document.getElementById("venda-desconto").value) || 0;
  const totalLiquido = Math.max(0, subtotal - desconto);
  const cliente = document.getElementById("venda-cliente").value.trim() || "Consumidor Final";
  const pagamento = document.getElementById("venda-pagamento").value;

  try {
    // Transação garante que todos os estoques sejam validados e descontados juntos
    await runTransaction(db, async (transaction) => {
      const refs = carrinho.map((item) => doc(db, "produtos", item.id));
      const snaps = await Promise.all(refs.map((r) => transaction.get(r)));

      snaps.forEach((snap, i) => {
        if (!snap.exists()) throw new Error(`Produto ${carrinho[i].nome} não encontrado.`);
        const saldoAtual = snap.data().quantidade;
        if (saldoAtual < carrinho[i].qtd) {
          throw new Error(`Estoque insuficiente para ${carrinho[i].nome} (Saldo: ${saldoAtual}).`);
        }
      });

      snaps.forEach((snap, i) => {
        const novoSaldo = snap.data().quantidade - carrinho[i].qtd;
        transaction.update(refs[i], {
          quantidade: novoSaldo,
          atualizadoEm: serverTimestamp()
        });
      });

      const novaVendaRef = doc(collection(db, "vendas"));
      transaction.set(novaVendaRef, {
        cliente,
        itens: carrinho,
        subtotal,
        desconto,
        totalLiquido,
        pagamento,
        nfceStatus: "nao_emitida",
        criadoEm: serverTimestamp()
      });
    });

    carrinho = [];
    document.getElementById("venda-cliente").value = "";
    document.getElementById("venda-desconto").value = "0";
    renderCarrinho();
    alert("Venda registrada e estoque atualizado!");
  } catch (err) {
    alert("Erro ao finalizar venda: " + err.message);
  }
});

function renderVendas() {
  const tbody = document.getElementById("lista-vendas");
  tbody.innerHTML = vendas
    .slice(0, 30)
    .map((v) => {
      const resumoItens = (v.itens || []).map((i) => `${i.qtd}x ${i.nome}`).join(", ");
      return `
      <tr>
        <td>${formatDate(v.criadoEm)}</td>
        <td>${v.cliente}</td>
        <td>${resumoItens}</td>
        <td>${formatBRL(v.desconto)}</td>
        <td><strong>${formatBRL(v.totalLiquido)}</strong></td>
        <td>${v.pagamento}</td>
      </tr>`;
    })
    .join("");
}

// ================= 3. ENTRADAS DE ESTOQUE =================
document.getElementById("entrada-produto").addEventListener("change", (e) => {
  const p = produtos.find((item) => item.id === e.target.value);
  if (p) document.getElementById("entrada-custo").value = p.precoCusto;
});

document.getElementById("form-entrada").addEventListener("submit", async (e) => {
  e.preventDefault();
  const prodId = document.getElementById("entrada-produto").value;
  const qtd = parseInt(document.getElementById("entrada-qtd").value, 10);
  const novoCusto = parseFloat(document.getElementById("entrada-custo").value);
  const fornecedor = document.getElementById("entrada-fornecedor").value.trim() || "-";

  const prod = produtos.find((p) => p.id === prodId);
  if (!prod || qtd <= 0) return;

  await runTransaction(db, async (transaction) => {
    const prodRef = doc(db, "produtos", prodId);
    const snap = await transaction.get(prodRef);
    const data = snap.data();
    const novaQtd = (data.quantidade || 0) + qtd;

    transaction.update(prodRef, {
      quantidade: novaQtd,
      precoCusto: novoCusto,
      lucroPercentual: parseFloat(calcLucro(novoCusto, data.precoVenda)),
      ultimaCompra: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    const entradaRef = doc(collection(db, "entradas"));
    transaction.set(entradaRef, {
      produtoId: prodId,
      produtoNome: data.nome,
      quantidade: qtd,
      custoUnitario: novoCusto,
      fornecedor,
      criadoEm: serverTimestamp()
    });
  });

  e.target.reset();
  alert("Entrada registrada e estoque atualizado!");
});

function renderEntradas() {
  const tbody = document.getElementById("lista-entradas");
  tbody.innerHTML = entradas
    .slice(0, 25)
    .map(
      (en) => `
    <tr>
      <td>${formatDate(en.criadoEm)}</td>
      <td>${en.produtoNome}</td>
      <td>+${en.quantidade}</td>
      <td>${formatBRL(en.custoUnitario)}</td>
      <td>${en.fornecedor}</td>
    </tr>`
    )
    .join("");
}

// ================= 4. DESPESAS & RESUMO =================
document.getElementById("form-despesa").addEventListener("submit", async (e) => {
  e.preventDefault();
  await addDoc(collection(db, "despesas"), {
    descricao: document.getElementById("despesa-desc").value.trim(),
    categoria: document.getElementById("despesa-cat").value,
    valor: parseFloat(document.getElementById("despesa-valor").value),
    criadoEm: serverTimestamp()
  });
  e.target.reset();
});

function renderDespesas() {
  const tbody = document.getElementById("lista-despesas");
  tbody.innerHTML = despesas
    .map(
      (d) => `
    <tr>
      <td>${formatDate(d.criadoEm)}</td>
      <td>${d.descricao}</td>
      <td>${d.categoria}</td>
      <td class="text-danger"><strong>${formatBRL(d.valor)}</strong></td>
      <td><button class="btn btn-danger btn-sm" onclick="deletarDespesa('${d.id}')">X</button></td>
    </tr>`
    )
    .join("");
}

window.deletarDespesa = async (id) => {
  if (confirm("Remover esta despesa?")) {
    await deleteDoc(doc(db, "despesas", id));
  }
};

function atualizarKPIs() {
  const totalVendas = vendas.reduce((acc, v) => acc + (v.totalLiquido || 0), 0);
  const totalDespesas = despesas.reduce((acc, d) => acc + (d.valor || 0), 0);
  const valorEstoque = produtos.reduce(
    (acc, p) => acc + (p.precoCusto || 0) * (p.quantidade || 0),
    0
  );

  document.getElementById("kpi-vendas").textContent = formatBRL(totalVendas);
  document.getElementById("kpi-despesas").textContent = formatBRL(totalDespesas);
  document.getElementById("kpi-saldo").textContent = formatBRL(totalVendas - totalDespesas);
  document.getElementById("kpi-estoque").textContent = formatBRL(valorEstoque);
}

// ================= EXPORTAÇÃO CSV (EXCEL / GOOGLE SHEETS) =================
function baixarCSV(nomeArquivo, cabecalhos, linhas) {
  const bom = "\uFEFF"; // Garante acentuação correta no Excel PT-BR
  const csv =
    bom +
    [cabecalhos.join(";"), ...linhas.map((l) => l.join(";"))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById("btn-export-produtos").addEventListener("click", () => {
  baixarCSV(
    "estoque-taberna.csv",
    ["COD", "Nome", "Categoria", "Preco Custo", "Preco Venda", "% Lucro", "Quantidade", "NCM", "CFOP"],
    produtos.map((p) => [
      p.cod,
      p.nome,
      p.categoria || "",
      String(p.precoCusto).replace(".", ","),
      String(p.precoVenda).replace(".", ","),
      String(p.lucroPercentual || 0).replace(".", ","),
      p.quantidade,
      p.dadosFiscais?.ncm || "",
      p.dadosFiscais?.cfop || ""
    ])
  );
});

document.getElementById("btn-export-vendas").addEventListener("click", () => {
  baixarCSV(
    "vendas-taberna.csv",
    ["Data", "Cliente", "Itens", "Subtotal", "Desconto", "Total Liquido", "Pagamento"],
    vendas.map((v) => [
      formatDate(v.criadoEm),
      v.cliente,
      (v.itens || []).map((i) => `${i.qtd}x ${i.nome}`).join(" | "),
      String(v.subtotal).replace(".", ","),
      String(v.desconto).replace(".", ","),
      String(v.totalLiquido).replace(".", ","),
      v.pagamento
    ])
  );
});

document.getElementById("btn-export-despesas").addEventListener("click", () => {
  baixarCSV(
    "despesas-taberna.csv",
    ["Data", "Descricao", "Categoria", "Valor"],
    despesas.map((d) => [
      formatDate(d.criadoEm),
      d.descricao,
      d.categoria,
      String(d.valor).replace(".", ",")
    ])
  );
});
