import pandas as pd
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, START, END
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
import operator

# ==========================================
# 1. DEFINICIÓN DEL ESTADO (Memoria Compartida)
# ==========================================
class DataState(TypedDict):
    file_path: str
    clean_file_path: str
    raw_data_sample: str
    context: str                 # Lo que genera el Agente 1
    cleaning_code: str           # Código generado por Agente 2
    format_valid: bool           # Resultado del Agente 3
    data_integrity_valid: bool   # Resultado del Agente 4
    iteration: int               # Contador para evitar bucles infinitos
    errors: str

# Instanciamos el LLM (Ej: GPT-4o)
llm = ChatOpenAI(model="gpt-4o", temperature=0)

# ==========================================
# 2. DEFINICIÓN DE LOS AGENTES (Nodos)
# ==========================================

def agent_1_profiler(state: DataState):
    """Agente 1: Analiza qué es el archivo, sus variables y contexto."""
    print("--- [AGENTE 1] Analizando archivo y generando contexto ---")
    
    # Leemos una muestra del archivo real usando pandas
    df = pd.read_csv(state["file_path"]) if state["file_path"].endswith('.csv') else pd.read_excel(state["file_path"])
    sample = df.head(5).to_markdown()
    info = str(df.dtypes)
    
    prompt = f"""
    Eres un Analista de Datos experto. Aquí tienes una muestra de un dataset y sus tipos de datos actuales.
    Analiza conceptualmente de qué trata este dataset, qué representa cada variable y qué formato IDEAL debería tener cada columna (ej. fechas en datetime, dinero en float, etc.).
    Muestra:
    {sample}
    Tipos actuales:
    {info}
    """
    
    response = llm.invoke([HumanMessage(content=prompt)])
    
    return {
        "context": response.content, 
        "raw_data_sample": sample,
        "iteration": state.get("iteration", 0) + 1
    }


def agent_2_cleaner(state: DataState):
    """Agente 2: Estandariza y limpia basado en el contexto del Agente 1."""
    print(f"--- [AGENTE 2] Limpiando datos (Iteración {state['iteration']}) ---")
    
    # Aquí el LLM debería generar un código de Python (Pandas) para limpiar el archivo
    prompt = f"""
    Eres un Ingeniero de Datos. 
    Basado en este contexto: {state['context']}
    Y los errores previos (si los hay): {state.get('errors', 'Ninguno')}
    
    Escribe SOLO el código Python usando Pandas para cargar '{state["file_path"]}', 
    limpiar las columnas, estandarizar formatos y guardar el resultado en 'cleaned_data.csv'.
    """
    
    # Simulamos la generación y ejecución del código por seguridad y brevedad
    # En producción usarías una herramienta de Python REPL de Langchain.
    # df_clean = apply_llm_code(df_raw, generated_code)
    
    clean_path = "cleaned_data.csv"
    # Simulamos que guardó el archivo limpio
    # df_clean.to_csv(clean_path, index=False)
    
    return {"clean_file_path": clean_path, "cleaning_code": "codigo_python_generado"}


def agent_3_validator(state: DataState):
    """Agente 3: Valida que los formatos sean correctos (Paralelo)"""
    print("--- [AGENTE 3] Validando formatos de columnas ---")
    
    # Lógica: Cargar clean_file_path y verificar dtypes contra el contexto
    # Retorna True si todo está en el formato correcto
    format_is_correct = True # Simulación de validación
    error_msg = "" if format_is_correct else "Error en Agente 3: La columna 'Fecha' sigue siendo texto."
    
    return {"format_valid": format_is_correct, "errors": error_msg}


def agent_4_auditor(state: DataState):
    """Agente 4: Compara archivo original con limpio para evitar pérdida de datos (Paralelo)"""
    print("--- [AGENTE 4] Auditando integridad de datos (Original vs Limpio) ---")
    
    # Lógica programática determinista (Mejor que usar un LLM para esto):
    # df_raw = pd.read_csv(state["file_path"])
    # df_clean = pd.read_csv(state["clean_file_path"])
    # integrity = (len(df_raw) == len(df_clean)) and otros_chequeos
    
    integrity_is_correct = True # Simulación de auditoría
    error_msg = "" if integrity_is_correct else "Error en Agente 4: Se perdieron 5 filas durante la limpieza."
    
    return {"data_integrity_valid": integrity_is_correct, "errors": error_msg}

# ==========================================
# 3. NODO DE EVALUACIÓN Y ENRUTAMIENTO (Loop)
# ==========================================

def evaluate_results(state: DataState):
    """Nodo ficticio que simplemente junta los estados del paralelismo"""
    return state

def should_continue(state: DataState):
    """Decide si el flujo termina o vuelve al Agente 2"""
    
    # Si superamos 3 iteraciones, forzamos el final para evitar bucles infinitos
    if state["iteration"] >= 3:
        print("--- [SISTEMA] Límite de iteraciones alcanzado. Terminando. ---")
        return "end"
        
    # Validamos lo que dijeron el Agente 3 y el Agente 4
    if state.get("format_valid") and state.get("data_integrity_valid"):
        print("--- [SISTEMA] Validación y Auditoría PASADAS. Finalizando. ---")
        return "end"
    else:
        print(f"--- [SISTEMA] Fallo en Validación/Auditoría. Errores: {state['errors']}. Reintentando Agente 2 ---")
        return "retry_cleaner"

# ==========================================
# 4. CONSTRUCCIÓN DEL GRAFO (Workflow)
# ==========================================

workflow = StateGraph(DataState)

# Agregar nodos
workflow.add_node("Agent_1_Profiler", agent_1_profiler)
workflow.add_node("Agent_2_Cleaner", agent_2_cleaner)
workflow.add_node("Agent_3_Validator", agent_3_validator)
workflow.add_node("Agent_4_Auditor", agent_4_auditor)
workflow.add_node("Join_Evaluation", evaluate_results)

# Definir el flujo (Edges)
workflow.add_edge(START, "Agent_1_Profiler")
workflow.add_edge("Agent_1_Profiler", "Agent_2_Cleaner")

# Paralelismo: Agente 2 pasa la info al 3 y al 4 al mismo tiempo
workflow.add_edge("Agent_2_Cleaner", "Agent_3_Validator")
workflow.add_edge("Agent_2_Cleaner", "Agent_4_Auditor")

# Ambos convergen en el nodo de evaluación
workflow.add_edge("Agent_3_Validator", "Join_Evaluation")
workflow.add_edge("Agent_4_Auditor", "Join_Evaluation")

# Lógica Condicional (El Loop)
workflow.add_conditional_edges(
    "Join_Evaluation",
    should_continue,
    {
        "retry_cleaner": "Agent_2_Cleaner", # Si falla, vuelve al agente 2
        "end": END                          # Si acierta, termina
    }
)

# Compilar el grafo
app = workflow.compile()

# ==========================================
# 5. EJECUCIÓN
# ==========================================
if __name__ == "__main__":
    initial_state = {
        "file_path": "datos_crudos.csv",
        "iteration": 0,
        "errors": ""
    }
    
    # Ejecutamos el flujo
    for output in app.stream(initial_state):
        # LangGraph imprime en tiempo real qué nodo se está ejecutando
        pass