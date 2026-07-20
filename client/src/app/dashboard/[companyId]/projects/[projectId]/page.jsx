// app/dashboard/[companyId]/projects/[projectId]/page.jsx
'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ProjectSkeleton } from '@/components/Skeleton';
import Alert from '@/components/Alert';
import { useProject } from '@/hooks/useProject';
import EnvironmentSection from '@/components/Project/EnvironmentSection';
import VariableSection from '@/components/Project/VariableSection';
import ShareModal from '@/components/Project/ShareModal';

export default function ProjectDetailPage() {
  const { companyId, projectId } = useParams();

  const {
    project,
    companyName,
    environments,
    activeEnvId,
    activeEnv,
    variables,
    loading,
    varsLoading,
    error,
    notice,
    setError,
    setNotice,
    varSearch,
    varFilter,
    varPage,
    setVarPage,
    varTotalPages,
    varPageSafe,
    paginatedVariables,
    filteredVariables,
    handleVarSearchChange,
    handleVarFilterChange,
    handleSwitchEnv,
    addEnvOpen,
    setAddEnvOpen,
    newEnvName,
    setNewEnvName,
    addEnvSubmitting,
    handleAddEnvironment,
    addVarOpen,
    setAddVarOpen,
    newKey,
    setNewKey,
    newValue,
    setNewValue,
    showNewValue,
    setShowNewValue,
    newIsSecret,
    setNewIsSecret,
    addVarSubmitting,
    addVarError,
    setAddVarError,
    handleAddVariable,
    importOpen,
    setImportOpen,
    importText,
    setImportText,
    importIsSecret,
    setImportIsSecret,
    importSubmitting,
    importError,
    setImportError,
    handleImport,
    handleFileSelect,
    deletingVar,
    setDeletingVar,
    deleteSubmitting,
    handleConfirmDelete,
    revealed,
    copiedId,
    toggleReveal,
    handleCopy,
    handleCopyAll,
    handleDownloadEnv,
    handleDownloadCsv,
    shareExpiryOpen,
    setShareExpiryOpen,
    shareExpiryMinutes,
    setShareExpiryMinutes,
    customExpiryValue,
    setCustomExpiryValue,
    customExpiryUnit,
    setCustomExpiryUnit,
    isCustomExpiry,
    setIsCustomExpiry,
    generatingLink,
    shareError,
    setShareError,
    shareLink,
    showShareModal,
    setShowShareModal,
    shareCopied,
    shareStep,
    setShareStep,
    shareAll,
    setShareAll,
    selectedKeys,
    setSelectedKeys,
    handleGenerateLink,
    copyShareLink,
  } = useProject(companyId, projectId);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <ProjectSkeleton />
      </div>
    );
  }

  const hasVariables = variables.length > 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link href={`/dashboard/${companyId}`} className="text-sm text-mist hover:text-paper">
        &larr; {companyName || 'Back to company'}
      </Link>

      <p className="mt-4 font-mono text-xs uppercase tracking-wider text-signal">Project</p>
      <h1 className="mt-2 text-2xl font-semibold text-paper">{project?.name}</h1>

      <EnvironmentSection
        environments={environments}
        activeEnvId={activeEnvId}
        onSwitchEnv={handleSwitchEnv}
        addEnvOpen={addEnvOpen}
        setAddEnvOpen={setAddEnvOpen}
        newEnvName={newEnvName}
        setNewEnvName={setNewEnvName}
        addEnvSubmitting={addEnvSubmitting}
        handleAddEnvironment={handleAddEnvironment}
        error={error}
        setError={setError}
      />

      {error && <Alert variant="error" className="mt-4">{error}</Alert>}
      {notice && <Alert variant="success" className="mt-4">{notice}</Alert>}

      <VariableSection
        variables={variables}
        varsLoading={varsLoading}
        filteredVariables={filteredVariables}
        paginatedVariables={paginatedVariables}
        varPageSafe={varPageSafe}
        varTotalPages={varTotalPages}
        onVarPageChange={setVarPage}
        varSearch={varSearch}
        onVarSearchChange={handleVarSearchChange}
        varFilter={varFilter}
        onVarFilterChange={handleVarFilterChange}
        onCopyAll={handleCopyAll}
        onDownloadEnv={handleDownloadEnv}
        onDownloadCsv={handleDownloadCsv}
        onGenerateLink={() => {
          setShareError('');
          setShareExpiryMinutes(60);
          setIsCustomExpiry(false);
          setCustomExpiryValue(1);
          setCustomExpiryUnit('hours');
          setShareStep(1);
          setShareAll(true);
          setSelectedKeys([]);
          setShareExpiryOpen(true);
        }}
        hasVariables={hasVariables}
        addVarOpen={addVarOpen}
        setAddVarOpen={setAddVarOpen}
        addVarError={addVarError}
        setAddVarError={setAddVarError}
        newKey={newKey}
        setNewKey={setNewKey}
        newValue={newValue}
        setNewValue={setNewValue}
        showNewValue={showNewValue}
        setShowNewValue={setShowNewValue}
        newIsSecret={newIsSecret}
        setNewIsSecret={setNewIsSecret}
        addVarSubmitting={addVarSubmitting}
        handleAddVariable={handleAddVariable}
        importOpen={importOpen}
        setImportOpen={setImportOpen}
        importError={importError}
        setImportError={setImportError}
        importText={importText}
        setImportText={setImportText}
        importIsSecret={importIsSecret}
        setImportIsSecret={setImportIsSecret}
        importSubmitting={importSubmitting}
        handleImport={handleImport}
        handleFileSelect={handleFileSelect}
        deletingVar={deletingVar}
        setDeletingVar={setDeletingVar}
        deleteSubmitting={deleteSubmitting}
        handleConfirmDelete={handleConfirmDelete}
        revealed={revealed}
        copiedId={copiedId}
        toggleReveal={toggleReveal}
        handleCopy={handleCopy}
      />

      <ShareModal
        open={shareExpiryOpen}
        onClose={() => setShareExpiryOpen(false)}
        step={shareStep}
        setStep={setShareStep}
        shareAll={shareAll}
        setShareAll={setShareAll}
        selectedKeys={selectedKeys}
        setSelectedKeys={setSelectedKeys}
        variables={variables}
        expiryMinutes={shareExpiryMinutes}
        setExpiryMinutes={setShareExpiryMinutes}
        isCustomExpiry={isCustomExpiry}
        setIsCustomExpiry={setIsCustomExpiry}
        customExpiryValue={customExpiryValue}
        setCustomExpiryValue={setCustomExpiryValue}
        customExpiryUnit={customExpiryUnit}
        setCustomExpiryUnit={setCustomExpiryUnit}
        generatingLink={generatingLink}
        shareError={shareError}
        setShareError={setShareError}
        handleGenerateLink={handleGenerateLink}
        showResult={showShareModal}
        setShowResult={setShowShareModal}
        shareLink={shareLink}
        shareCopied={shareCopied}
        copyShareLink={copyShareLink}
      />
    </div>
  );
}