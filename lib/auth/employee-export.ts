type EmployeeExport = { employeeId: string | null; name: string; email: string; role: string; team: string };

export function employeeCsv(employees: EmployeeExport[]) {
  const cell = (value: string | null) => {
    const text = value || "";
    const safe = /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [
    ["Employee ID", "Name", "Email", "Role", "Team"],
    ...employees.map(employee => [employee.employeeId, employee.name, employee.email, employee.role, employee.team]),
  ].map(row => row.map(cell).join(",")).join("\r\n");
}
